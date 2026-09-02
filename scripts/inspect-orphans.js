// Inspect orphan rows before cleanup: full appointment rows + membership orphans.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envText = fs.readFileSync(path.join(__dirname, '..', 'server', '.env'), 'utf8');
function envValue(name) {
  const re = new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`, 'm');
  return (envText.match(re) || [])[1]?.trim().replace(/^["']|["']$/g, '') || '';
}
const parsed = new URL(envValue('DATABASE_URL'));
const projectRef = parsed.hostname.replace(/^db\./, '').replace(/\.supabase\.co$/, '');
const cs = `postgresql://postgres.${projectRef}:${encodeURIComponent(decodeURIComponent(parsed.password))}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`;

(async () => {
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const appts = await c.query(`
    select * from appointments a
    left join users u on u.id = a.user_id
    where u.id is null
  `);
  console.log(`=== ALL orphan appointments: ${appts.rows.length} ===`);
  console.log(JSON.stringify(appts.rows, null, 2));

  const memCols = await c.query(`
    select column_name, data_type from information_schema.columns
    where table_schema='public' and table_name='memberships' order by ordinal_position
  `);
  console.log('\n=== memberships columns ===');
  console.log(memCols.rows.map((r) => `  ${r.column_name} (${r.data_type})`).join('\n'));

  const mem = await c.query(`
    select m.* from memberships m
    left join users u on u.id = m.user_id
    where u.id is null
    limit 10
  `);
  console.log(`\n=== orphan memberships (any state): ${mem.rows.length} ===`);
  console.log(JSON.stringify(mem.rows, null, 2));

  await c.end();
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
