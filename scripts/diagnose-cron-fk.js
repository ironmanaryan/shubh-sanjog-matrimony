// Diagnose the FK violation in the cron reminder functions: find orphan
// appointments/memberships whose user_id is missing from public.users.
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

  // Full function definitions (see exactly what they insert)
  for (const fn of ['fn_send_appointment_reminders', 'fn_send_membership_expiry_reminders']) {
    const src = await c.query(`select pg_get_functiondef(oid) as def from pg_proc where proname = $1`, [fn]);
    console.log(`\n===== ${fn} =====`);
    console.log(src.rows[0]?.def || '(missing)');
  }

  // Orphan appointments (Booked, tomorrow-ish window)
  const orphanAppts = await c.query(`
    select a.id, a.user_id, a.status, a.date
    from appointments a
    left join users u on u.id = a.user_id
    where u.id is null and a.status in ('Booked','booked','Confirmed','confirmed')
    order by a.date limit 10
  `);
  console.log(`\n=== orphan Booked appointments (no users row): ${orphanAppts.rows.length} ===`);
  for (const r of orphanAppts.rows) console.log(`  ${r.id} | user=${r.user_id} | status=${r.status} | date=${r.date}`);

  // Orphan memberships (active, expiring soon)
  const orphanMem = await c.query(`
    select m.id, m.user_id, m.active, m.expires_at
    from memberships m
    left join users u on u.id = m.user_id
    where u.id is null and m.active = true and m.expires_at is not null
      and m.expires_at <= (now() + interval '3 days')
    order by m.expires_at limit 10
  `);
  console.log(`\n=== orphan active memberships expiring ≤3d: ${orphanMem.rows.length} ===`);
  for (const r of orphanMem.rows) console.log(`  ${r.id} | user=${r.user_id} | expires=${r.expires_at}`);

  // Also: how the appointments table stores date/status (helps read the function)
  const cols = await c.query(`
    select table_name, column_name, data_type from information_schema.columns
    where table_schema='public' and table_name in ('appointments','memberships')
    order by table_name, ordinal_position
  `);
  console.log('\n=== columns ===');
  console.log(cols.rows.map((r) => `  ${r.table_name}.${r.column_name} (${r.data_type})`).join('\n'));

  await c.end();
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
