/**
 * Tests the DEPLOYED production API (Vercel) with a real Supabase session:
 *   GET  /api/notifications        → 200 + user's rows (polling-backup path)
 *   POST /api/notifications/read   → marks read, then GET reflects it
 * Creates a disposable user, then cleans everything up.
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
const BASE = process.env.SMOKE_BASE || 'https://shubh-sanjog-matrimony.vercel.app';

const results = [];
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

(async () => {
  const admin = createClient(URL_, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const stamp = Date.now();
  const email = `e2e-api-${stamp}@shubhsanjog.in`;
  const password = `E2e!${stamp}xY`;
  let uid = null;

  try {
    // 0. Is the site even reachable?
    const home = await fetch(BASE, { redirect: 'manual' });
    check(`site reachable (${BASE})`, home.status >= 200 && home.status < 500, `HTTP ${home.status}`);

    // unauthenticated request must be rejected (auth middleware active)
    const anon401 = await fetch(`${BASE}/api/notifications`);
    check('GET /api/notifications without token → 401', anon401.status === 401, `HTTP ${anon401.status}`);

    // 1. Disposable user (auth + users row)
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    uid = u.data?.user?.id;
    check('test auth user created', !u.error && !!uid, u.error?.message);
    await admin.from('users').upsert({ id: uid, identifier: uid, email, full_name: 'E2E API', role: 'customer' });

    // 2. Real session (same mechanism the browser uses)
    const userClient = createClient(URL_, ANON);
    const sess = await userClient.auth.signInWithPassword({ email, password });
    const token = sess.data?.session?.access_token;
    check('sign-in (Supabase JWT)', !!token, sess.error?.message);

    // 3. Seed one notification server-side, then hit the DEPLOYED API
    await admin.from('notifications').insert({
      id: crypto.randomUUID(),
      to_user_id: uid,
      type: 'document_approved',
      payload: JSON.stringify({ title: 'deployed API test' }),
      at: Date.now(),
    });

    const res1 = await fetch(`${BASE}/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json1 = await res1.json().catch(() => ({}));
    check(
      'DEPLOYED GET /api/notifications → 200 with rows',
      res1.status === 200 && Array.isArray(json1.notifications),
      `HTTP ${res1.status}, ${json1.notifications?.length ?? '?'} row(s)`
    );
    check(
      'deployed API returns the server-side notification',
      (json1.notifications || []).some((n) => n.type === 'document_approved' && (n.read_at ?? n.readAt) == null)
    );

    // 4. Mark all read via deployed API
    const res2 = await fetch(`${BASE}/api/notifications/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    const json2 = await res2.json().catch(() => ({}));
    check('DEPLOYED POST /api/notifications/read → ok', res2.status === 200 && json2.ok === true, `HTTP ${res2.status}, updated=${json2.updated}`);

    const res3 = await fetch(`${BASE}/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json3 = await res3.json().catch(() => ({}));
    check(
      'GET reflects read state after mark-read',
      (json3.notifications || []).every((n) => (n.read_at ?? n.readAt) != null)
    );

    try { await userClient.auth.signOut(); } catch {}
  } catch (err) {
    console.error('UNEXPECTED:', err.message);
    results.push(false);
  } finally {
    try {
      if (uid) {
        await admin.from('notifications').delete().eq('to_user_id', uid);
        await admin.from('users').delete().eq('id', uid);
        await admin.auth.admin.deleteUser(uid);
      }
      console.log('  🧹 cleanup done');
    } catch (e) {
      console.log(`  ⚠️ cleanup partial: ${e.message}`);
    }
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n=== VERDICT: ${passed}/${results.length} checks passed ===`);
  process.exit(results.every(Boolean) ? 0 : 1);
})();
