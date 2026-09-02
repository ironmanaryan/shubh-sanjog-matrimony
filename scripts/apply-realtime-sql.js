// Applies the updated supabase/realtime_notifications.sql (adds the
// notifications_delete_own RLS policy) — idempotent, safe to re-run.
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

function splitStatements(text) {
  const statements = [];
  let current = [];
  let inDollar = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine;
    if (!inDollar && line.trim().startsWith('--')) continue;
    const dollarCount = (line.match(/\$\$/g) || []).length;
    if (dollarCount % 2 === 1) inDollar = !inDollar;
    current.push(line);
    if (!inDollar && line.trim().endsWith(';')) {
      const stmt = current.join('\n').trim();
      if (stmt && stmt !== ';') statements.push(stmt);
      current = [];
    }
  }
  const tail = current.join('\n').trim();
  if (tail && tail !== ';') statements.push(tail);
  return statements;
}

(async () => {
  const sqlText = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'realtime_notifications.sql'), 'utf8');
  const statements = splitStatements(sqlText);
  console.log(`Loaded ${statements.length} statements`);

  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await c.connect();

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const label = stmt.replace(/\s+/g, ' ').slice(0, 72);
    try {
      await c.query(stmt);
      ok += 1;
      console.log(`✓ [${i + 1}/${statements.length}] ${label}`);
    } catch (e) {
      if (/already exists/i.test(e.message || '')) {
        ok += 1;
        console.log(`⊘ [${i + 1}/${statements.length}] already exists — ${label}`);
      } else {
        failed += 1;
        console.error(`✗ [${i + 1}/${statements.length}] ${label}\n   → ${(e.message || '').slice(0, 220)}`);
      }
    }
  }

  const pols = await c.query(
    `select policyname, cmd from pg_policies where schemaname='public' and tablename='notifications' order by policyname`
  );
  console.log(`\nnotifications policies now: ${pols.rows.map((p) => `${p.policyname}[${p.cmd}]`).join(', ')}`);

  await c.end();
  console.log(`\nDone: ${ok} ok, ${failed} failed.`);
  process.exitCode = failed > 0 ? 1 : 0;
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
