// Dump every RLS policy on public tables (definitions + roles), and list
// tables where the public grants exist despite RLS (for access-path analysis).
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envText = fs.readFileSync(path.join(__dirname, '..', 'server', '.env'), 'utf8');
function envValue(name) {
  const re = new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`, 'm');
  return (envText.match(re) || [])[1]?.trim().replace(/^["']|["']$/g, '') || '';
}
const dbUrl = envValue('DATABASE_URL');
const parsed = new URL(dbUrl);
const projectRef = parsed.hostname.replace(/^db\./, '').replace(/\.supabase\.co$/, '');
const connectionString = `postgresql://postgres.${projectRef}:${encodeURIComponent(decodeURIComponent(parsed.password))}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`;

(async () => {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const pols = await c.query(`
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  `);
  console.log(`=== ${pols.rows.length} policies on public schema ===`);
  let current = '';
  for (const p of pols.rows) {
    if (p.tablename !== current) {
      current = p.tablename;
      console.log(`\n▶ ${p.tablename}`);
    }
    const qual = (p.qual || '').replace(/\s+/g, ' ').slice(0, 160);
    const wc = (p.with_check || '').replace(/\s+/g, ' ').slice(0, 160);
    console.log(`  [${p.cmd}] ${p.policyname}  roles=${JSON.stringify(p.roles)}`);
    if (qual) console.log(`     USING: ${qual}`);
    if (wc) console.log(`     CHECK: ${wc}`);
  }

  // Grants visible to anon/authenticated roles on RLS tables (does the Data API expose them?)
  const grants = await c.query(`
    select c.relname as tablename,
           array_agg(distinct g.grantee order by g.grantee) as grantees
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join information_schema.role_table_grants g
      on g.table_schema = n.nspname and g.table_name = c.relname
    where n.nspname = 'public' and c.relkind = 'r'
      and g.grantee in ('anon', 'authenticated')
    group by c.relname
    order by c.relname
  `);
  console.log(`\n=== tables granted to anon/authenticated (${grants.rows.length}) ===`);
  for (const g of grants.rows) console.log(`  - ${g.tablename}: ${JSON.stringify(g.grantees)}`);

  await c.end();
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
