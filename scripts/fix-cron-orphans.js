/**
 * Fixes the cron FK crash found in live testing:
 *   1. Re-applies the two reminder functions from the updated
 *      supabase/realtime_notifications.sql (now guarded against orphans)
 *   2. Deletes orphan appointments/memberships whose user row is gone
 *      (verified test residue — junk notes, user deleted)
 *   3. Runs both functions twice (insert + idempotency proof)
 */
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

// $$-aware statement splitter (same logic as run-realtime-migration.js)
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
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await c.connect();

  // 1. Re-apply the guarded reminder functions
  const sqlText = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'realtime_notifications.sql'), 'utf8');
  const fns = splitStatements(sqlText).filter((s) =>
    /^create or replace function public\.fn_send_(appointment_reminders|membership_expiry_reminders)/i.test(s)
  );
  for (const fn of fns) {
    const name = /fn_send_\w+/.exec(fn)[0];
    await c.query(fn);
    console.log(`✓ re-applied ${name} (with users-exists guard)`);
  }

  // 2. Delete orphan rows (test residue)
  const delA = await c.query(`
    delete from appointments a
    where not exists (select 1 from users u where u.id = a.user_id)
    returning a.user_id, a.status, a.date
  `);
  console.log(`✓ deleted ${delA.rowCount} orphan appointment(s):`);
  for (const r of delA.rows) console.log(`   - user=${r.user_id} status=${r.status} date=${r.date}`);

  const delM = await c.query(`
    delete from memberships m
    where not exists (select 1 from users u where u.id = m.user_id)
    returning m.user_id
  `);
  console.log(`✓ deleted ${delM.rowCount} orphan membership(s)`);

  // 3. Run both functions twice — first run may insert, second must be 0
  console.log('\n=== cron function test ===');
  const r1 = await c.query(`select public.fn_send_appointment_reminders() as n`);
  const r2 = await c.query(`select public.fn_send_membership_expiry_reminders() as n`);
  console.log(`  run 1: appointment=${r1.rows[0].n}, membership=${r2.rows[0].n}`);

  const r1b = await c.query(`select public.fn_send_appointment_reminders() as n`);
  const r2b = await c.query(`select public.fn_send_membership_expiry_reminders() as n`);
  console.log(`  run 2 (idempotency): appointment=${r1b.rows[0].n}, membership=${r2b.rows[0].n}`);

  const idempotent = Number(r1b.rows[0].n) === 0 && Number(r2b.rows[0].n) === 0;
  console.log(`\n${idempotent ? '✅ functions healthy + idempotent — cron is safe' : '❌ idempotency broken — investigate'}`);

  await c.end();
  process.exit(idempotent ? 0 : 1);
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
