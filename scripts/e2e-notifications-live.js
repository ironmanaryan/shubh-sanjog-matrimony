/**
 * End-to-end live test of the realtime notification system.
 *
 * Simulates the exact browser flow with a disposable user:
 *   1. Create two throwaway auth users (A = subject, B = negative control)
 *   2. Sign in as A (real Supabase session, same as the browser)
 *   3. Subscribe to postgres_changes INSERT on notifications (RLS-scoped)
 *   4. Server-side insert for A  → event MUST arrive (latency measured)
 *   5. Server-side insert for B  → event MUST NOT arrive (RLS leak check)
 *   6. REST select as A          → sees own rows only
 *   7. Client-side insert as A   → allowed (AppointmentBooking path)
 *   8. Mark-read as A on own row → allowed; on B's row → blocked
 *   9. Full cleanup (rows + auth users)
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envText = fs.readFileSync(path.join(__dirname, '..', 'server', '.env'), 'utf8');
function envValue(name) {
  const re = new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`, 'm');
  return (envText.match(re) || [])[1]?.trim().replace(/^["']|["']$/g, '') || '';
}
const URL_ = envValue('SUPABASE_URL') || envValue('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE = envValue('SUPABASE_SERVICE_ROLE_KEY');
const ANON = envValue('SUPABASE_ANON_KEY') || envValue('NEXT_PUBLIC_SUPABASE_ANON_KEY');

const PASS = '  ✅';
const FAIL = '  ❌';
const results = [];
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? PASS : FAIL} ${name}${detail ? ` — ${detail}` : ''}`);
}

(async () => {
  const admin = createClient(URL_, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const stamp = Date.now();
  const password = `E2e!${stamp}xY`;
  const emailA = `e2e-notif-a-${stamp}@shubhsanjog.in`;
  const emailB = `e2e-notif-b-${stamp}@shubhsanjog.in`;

  let userA = null;
  let userB = null;

  try {
    // ── 1. Create throwaway auth users ─────────────────────────────────────
    const a = await admin.auth.admin.createUser({
      email: emailA, password, email_confirm: true,
    });
    check('auth user A created', !a.error, a.error?.message);
    userA = a.data?.user;
    const b = await admin.auth.admin.createUser({
      email: emailB, password, email_confirm: true,
    });
    check('auth user B created', !b.error, b.error?.message);
    userB = b.data?.user;
    if (!userA || !userB) throw new Error('test users unavailable');

    const uidA = userA.id;
    const uidB = userB.id;

    // ── 2. users rows (server-side createUserIfMissing style) ──────────────
    const insA = await admin.from('users').upsert({
      id: uidA, identifier: uidA, email: emailA, full_name: 'E2E Notif A', role: 'customer',
    });
    const insB = await admin.from('users').upsert({
      id: uidB, identifier: uidB, email: emailB, full_name: 'E2E Notif B', role: 'customer',
    });
    check('users rows created (A + B)', !insA.error && !insB.error, (insA.error || insB.error)?.message);

    // ── 3. Sign in as A (real session — exactly like the browser) ──────────
    const userClient = createClient(URL_, ANON);
    const sess = await userClient.auth.signInWithPassword({ email: emailA, password });
    check('sign-in as A (authenticated JWT)', !sess.error && !!sess.data?.session, sess.error?.message);

    // ── 4. Realtime: subscribe, then server-side insert for A ──────────────
    let eventA = null;
    let eventB = null;
    let subscribed = false;
    const channel = userClient
      .channel(`e2e-notif-${stamp}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (msg) => {
          const to = msg?.new?.to_user_id;
          if (to === uidA) eventA = { at: Date.now(), row: msg.new };
          if (to === uidB) eventB = { at: Date.now(), row: msg.new };
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') subscribed = true;
      });

    const subDeadline = Date.now() + 15_000;
    while (!subscribed && Date.now() < subDeadline) await new Promise((r) => setTimeout(r, 300));
    check('realtime channel SUBSCRIBED (RLS-authorized)', subscribed);

    // server-side insert for A (same row shape server/utils/notify.js writes)
    const t0 = Date.now();
    const noteA = {
      id: crypto.randomUUID(),
      to_user_id: uidA,
      type: 'appointment_confirmed',
      payload: JSON.stringify({ title: 'E2E realtime ping', at: new Date().toISOString() }),
      at: Date.now(),
    };
    const insN = await admin.from('notifications').insert(noteA);
    check('server-side notification insert (notifyUser path)', !insN.error, insN.error?.message);

    const evtDeadline = Date.now() + 12_000;
    while (!eventA && Date.now() < evtDeadline) await new Promise((r) => setTimeout(r, 200));
    check(
      'REALTIME: INSERT event delivered to user A',
      !!eventA,
      eventA ? `latency ${eventA.at - t0}ms` : 'no event within 12s'
    );

    // ── 5. Negative: insert for B must NOT reach A's channel ───────────────
    await admin.from('notifications').insert({
      id: crypto.randomUUID(),
      to_user_id: uidB,
      type: 'appointment_confirmed',
      payload: JSON.stringify({ title: 'E2E negative control' }),
      at: Date.now(),
    });
    await new Promise((r) => setTimeout(r, 5000));
    check('REALTIME: no RLS leak (B\u2019s event never reached A)', !eventB);

    // ── 6. REST select as A: own rows only ─────────────────────────────────
    const sel = await userClient.from('notifications').select('id, to_user_id');
    check('REST select as A succeeds', !sel.error, sel.error?.message);
    const visibleToA = sel.data || [];
    check('RLS select scopes to own rows only', visibleToA.every((r) => r.to_user_id === uidA), `${visibleToA.length} row(s)`);

    // ── 7. Client-side insert as A (AppointmentBooking path) ───────────────
    const ownInsert = await userClient.from('notifications').insert({
      id: crypto.randomUUID(),
      to_user_id: uidA,
      type: 'appointment_confirmed',
      payload: JSON.stringify({ title: 'client-side insert test' }),
      at: Date.now(),
    });
    check('client-side insert allowed (own row)', !ownInsert.error, ownInsert.error?.message);

    const foreignInsert = await userClient
      .from('notifications')
      .insert({
        id: crypto.randomUUID(),
        to_user_id: uidB,
        type: 'appointment_confirmed',
        payload: JSON.stringify({ title: 'should fail' }),
        at: Date.now(),
      });
    check('client-side insert blocked for another user', !!foreignInsert.error, foreignInsert.error?.message?.slice(0, 80) || 'inserted!');

    // ── 8. Mark-read: own allowed, foreign blocked ─────────────────────────
    const ownUpdate = await userClient
      .from('notifications')
      .update({ read_at: Date.now() })
      .eq('id', noteA.id);
    check('mark-read own row allowed', !ownUpdate.error, ownUpdate.error?.message);

    // .select() asks PostgREST for the affected-rows representation so we can
    // count what actually changed (supabase-js otherwise returns null data).
    const foreignUpdate = await userClient
      .from('notifications')
      .update({ read_at: Date.now() })
      .eq('to_user_id', uidB)
      .select('id');
    check(
      'mark-read other users\u2019 rows blocked',
      !foreignUpdate.error && (foreignUpdate.data?.length ?? -1) === 0,
      `${foreignUpdate.data?.length ?? '?'} rows touched`
    );
    // Ground truth: B's row must still be unread from the server's view.
    const bRow = await admin
      .from('notifications')
      .select('read_at')
      .eq('to_user_id', uidB)
      .maybeSingle();
    check(
      'ground truth: B\u2019s notification still unread (no cross-user tampering)',
      bRow.data ? bRow.data.read_at == null : !bRow.error,
      bRow.error?.message || (bRow.data?.read_at == null ? 'read_at still null' : `read_at=${bRow.data?.read_at}`)
    );

    // cleanup channel + session
    try { await userClient.removeChannel(channel); } catch {}
    try { await userClient.auth.signOut(); } catch {}
  } catch (err) {
    console.error('UNEXPECTED:', err.message);
    results.push(false);
  } finally {
    // ── 9. Cleanup everything ────────────────────────────────────────────────
    try {
      for (const uid of [userA?.id, userB?.id].filter(Boolean)) {
        await admin.from('notifications').delete().eq('to_user_id', uid);
        await admin.from('users').delete().eq('id', uid);
        await admin.auth.admin.deleteUser(uid);
      }
      console.log('\n  🧹 cleanup done (notifications + users + auth users removed)');
    } catch (e) {
      console.log(`\n  ⚠️ cleanup partial: ${e.message}`);
    }
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n=== VERDICT: ${passed}/${results.length} checks passed ===`);
  process.exit(results.every(Boolean) ? 0 : 1);
})();
