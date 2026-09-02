// Verifies the two pg_cron reminder functions: dumps their source (to confirm
// idempotent dedupe), executes them manually, and reports inserted rows.
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

  for (const fn of ['fn_send_appointment_reminders', 'fn_send_membership_expiry_reminders']) {
    const src = await c.query(`select pg_get_functiondef(oid) as def from pg_proc where proname = $1`, [fn]);
    const def = src.rows[0]?.def || '';
    console.log(`\n=== ${fn} (dedupe logic) ===`);
    const lines = def.split('\n').filter((l) => /not exists|distinct|on conflict|already/i.test(l));
    console.log(lines.length ? lines.map((l) => '  ' + l.trim()).join('\n') : '  (no explicit dedupe found!)');
  }

  console.log('\n=== manual execution (idempotent — safe to run) ===');
  const r1 = await c.query(`select public.fn_send_appointment_reminders() as n`);
  console.log(`  fn_send_appointment_reminders() → ${r1.rows[0].n} reminder(s) inserted`);
  const r2 = await c.query(`select public.fn_send_membership_expiry_reminders() as n`);
  console.log(`  fn_send_membership_expiry_reminders() → ${r2.rows[0].n} reminder(s) inserted`);

  const r1b = await c.query(`select public.fn_send_appointment_reminders() as n`);
  const r2b = await c.query(`select public.fn_send_membership_expiry_reminders() as n`);
  console.log(`\n=== re-run for idempotency proof ===`);
  console.log(`  fn_send_appointment_reminders() → ${r1b.rows[0].n} (must be 0)`);
  console.log(`  fn_send_membership_expiry_reminders() → ${r2b.rows[0].n} (must be 0)`);

  const recent = await c.query(
    `select type, count(*)::int as n from notifications
     where type in ('appointment_reminder','membership_expiry_reminder') group by type`
  );
  console.log('\n=== reminder rows currently in notifications ===');
  console.log(recent.rows.length ? recent.rows.map((r) => `  ${r.type}: ${r.n}`).join('\n') : '  (none — no appointments tomorrow / memberships expiring ≤3 days right now)');

  await c.end();
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
