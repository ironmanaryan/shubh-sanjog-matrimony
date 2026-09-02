/**
 * Definitive reminder-flow test:
 *   1. Create test user + a Booked appointment for TOMORROW
 *   2. Run fn_send_appointment_reminders() → must insert exactly 1
 *   3. Subscribe to realtime as that user → reminder event must arrive
 *   4. Re-run function → must insert 0 (idempotent)
 *   5. Full cleanup
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const envText = fs.readFileSync(path.join(__dirname, '..', 'server', '.env'), 'utf8');
function envValue(name) {
  const re = new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`, 'm');
  return (envText.match(re) || [])[1]?.trim().replace(/^["']|["']$/g, '') || '';
}
const parsed = new URL(envValue('DATABASE_URL'));
const projectRef = parsed.hostname.replace(/^db\./, '').replace(/\.supabase\.co$/, '');
const cs = `postgresql://postgres.${projectRef}:${encodeURIComponent(decodeURIComponent(parsed.password))}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`;

const URL_ = envValue('SUPABASE_URL') || envValue('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE = envValue('SUPABASE_SERVICE_ROLE_KEY');
const ANON = envValue('SUPABASE_ANON_KEY') || envValue('NEXT_PUBLIC_SUPABASE_ANON_KEY');

const results = [];
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

(async () => {
  const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
  const stamp = Date.now();
  const email = `e2e-rem-${stamp}@shubhsanjog.in`;
  const password = `E2e!${stamp}xY`;
  let uid = null;
  let apptId = null;

  const pg = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  try {
    // 1. test user + tomorrow's Booked appointment
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    uid = u.data?.user?.id;
    check('test auth user created', !!uid, u.error?.message);
    await admin.from('users').upsert({ id: uid, identifier: uid, email, full_name: 'E2E Reminder', role: 'customer' });

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    apptId = crypto.randomUUID();
    const ins = await admin.from('appointments').insert({
      id: apptId,
      user_id: uid,
      date: tomorrow,
      time: `${tomorrow}-11:00 AM`,
      type: 'Consultation',
      notes: 'e2e reminder test',
      status: 'Booked',
    });
    check(`Booked appointment created for tomorrow (${tomorrow})`, !ins.error, ins.error?.message);

    // 2. run reminder fn → expect exactly 1 insert
    const r1 = await pg.query(`select public.fn_send_appointment_reminders() as n`);
    check('reminder fn inserts 1 reminder', Number(r1.rows[0].n) === 1, `inserted=${r1.rows[0].n}`);

    // 3. realtime delivery of the reminder to the user's own channel
    const userClient = createClient(URL_, ANON);
    const sess = await userClient.auth.signInWithPassword({ email, password });
    check('sign-in works', !!sess.data?.session, sess.error?.message);

    let gotReminder = false;
    let subscribed = false;
    const channel = userClient
      .channel(`e2e-rem-${stamp}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (msg) => {
        if (msg?.new?.to_user_id === uid && msg?.new?.type === 'appointment_reminder') gotReminder = true;
      })
      .subscribe((s) => { if (s === 'SUBSCRIBED') subscribed = true; });

    const subDeadline = Date.now() + 15_000;
    while (!subscribed && Date.now() < subDeadline) await new Promise((r) => setTimeout(r, 300));
    check('realtime subscribed', subscribed);

    // re-fire the function? No — idempotency means no new row. Instead push a
    // second notification via the same server path to test live delivery now.
    await admin.from('notifications').insert({
      id: crypto.randomUUID(),
      to_user_id: uid,
      type: 'appointment_reminder',
      payload: JSON.stringify({ appointmentId: apptId, live: true }),
      at: Date.now(),
    });
    const evtDeadline = Date.now() + 12_000;
    while (!gotReminder && Date.now() < evtDeadline) await new Promise((r) => setTimeout(r, 200));
    check('REALTIME: reminder delivered live', gotReminder, gotReminder ? '' : 'no event in 12s');

    // 4. idempotency on the real reminder row
    const r2 = await pg.query(`select public.fn_send_appointment_reminders() as n`);
    check('re-run inserts 0 (dedupe by appointmentId)', Number(r2.rows[0].n) === 0, `inserted=${r2.rows[0].n}`);

    try { await userClient.removeChannel(channel); } catch {}
    try { await userClient.auth.signOut(); } catch {}
  } catch (err) {
    console.error('UNEXPECTED:', err.message);
    results.push(false);
  } finally {
    try {
      if (uid) {
        await pg.query(`delete from notifications where to_user_id = $1`, [uid]);
        await pg.query(`delete from appointments where user_id = $1`, [uid]);
        await pg.query(`delete from users where id = $1`, [uid]);
        await admin.auth.admin.deleteUser(uid);
      }
      await pg.end();
      console.log('  🧹 cleanup done');
    } catch (e) {
      console.log(`  ⚠️ cleanup partial: ${e.message}`);
    }
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n=== VERDICT: ${passed}/${results.length} checks passed ===`);
  process.exit(results.every(Boolean) ? 0 : 1);
})();
