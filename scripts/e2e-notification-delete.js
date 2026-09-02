/**
 * E2E test of the NEW notification DELETE feature (via the Express API):
 *   1. Disposable user + 3 notifications (2 unread, 1 read)
 *   2. DELETE { id }        → that row gone, others intact
 *   3. DELETE { all: true } → everything gone
 *   4. Foreign delete attempt → blocked (0 rows)
 *   5. Cleanup
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
const BASE = process.env.SMOKE_BASE || 'http://localhost:3000';

const results = [];
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

(async () => {
  const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
  const stamp = Date.now();
  const email = `e2e-del-${stamp}@shubhsanjog.in`;
  const password = `E2e!${stamp}xY`;
  let uid = null;

  try {
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    uid = u.data?.user?.id;
    check('test user created', !!uid, u.error?.message);
    await admin.from('users').upsert({ id: uid, identifier: uid, email, full_name: 'E2E Delete', role: 'customer' });

    // seed 3 notifications with distinct ids
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await admin.from('notifications').insert([
      { id: ids[0], to_user_id: uid, type: 'registration', payload: '{}', at: Date.now() - 3000 },
      { id: ids[1], to_user_id: uid, type: 'document_approved', payload: '{}', at: Date.now() - 2000 },
      { id: ids[2], to_user_id: uid, type: 'new_match_assigned', payload: '{}', at: Date.now() - 1000 },
    ]);
    const before = await admin.from('notifications').select('id').eq('to_user_id', uid);
    check('3 notifications seeded', (before.data || []).length === 3);

    const userClient = createClient(URL_, ANON);
    const sess = await userClient.auth.signInWithPassword({ email, password });
    const token = sess.data?.session?.access_token;
    check('sign-in ok', !!token, sess.error?.message);
    const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    // sanity: list endpoint returns 3
    const list1 = await fetch(`${BASE}/api/notifications`, { headers: authHeaders });
    const json1 = await list1.json().catch(() => ({}));
    check('GET /api/notifications lists 3', list1.status === 200 && (json1.notifications || []).length === 3, `HTTP ${list1.status}, ${(json1.notifications || []).length}`);

    // DELETE one by id
    const del1 = await fetch(`${BASE}/api/notifications`, {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ id: ids[0] }),
    });
    const jsonD1 = await del1.json().catch(() => ({}));
    check('DELETE {id} → ok', del1.status === 200 && jsonD1.ok === true, `HTTP ${del1.status}, deleted=${jsonD1.deleted}`);

    const after1 = await admin.from('notifications').select('id').eq('to_user_id', uid);
    const remaining = (after1.data || []).map((r) => r.id);
    check('row really gone from DB, others intact', remaining.length === 2 && remaining.includes(ids[1]) && remaining.includes(ids[2]));

    // DELETE all
    const delAll = await fetch(`${BASE}/api/notifications`, {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ all: true }),
    });
    const jsonDA = await delAll.json().catch(() => ({}));
    check('DELETE {all} → ok', delAll.status === 200 && jsonDA.ok === true, `HTTP ${delAll.status}, deleted=${jsonDA.deleted}`);

    const after2 = await admin.from('notifications').select('id').eq('to_user_id', uid);
    check('all rows gone from DB', (after2.data || []).length === 0, `remaining=${(after2.data || []).length}`);

    // foreign delete: user B tries to delete user A's row — must be a no-op
    const uB = await admin.auth.admin.createUser({
      email: `e2e-del-b-${stamp}@shubhsanjog.in`, password, email_confirm: true,
    });
    const uidB = uB.data?.user?.id;
    await admin.from('users').upsert({ id: uidB, identifier: uidB, email: `e2e-del-b-${stamp}@shubhsanjog.in`, role: 'customer' });
    await admin.from('notifications').insert({ id: crypto.randomUUID(), to_user_id: uidB, type: 'registration', payload: '{}', at: Date.now() });

    const sessB = await createClient(URL_, ANON).auth.signInWithPassword({ email: `e2e-del-b-${stamp}@shubhsanjog.in`, password });
    const tokenB = sessB.data?.session?.access_token;
    // B tries to delete A's (recreated) notification via the API — API scopes by req.user.id, so A's rows are untouchable
    await admin.from('notifications').insert({ id: ids[0], to_user_id: uid, type: 'registration', payload: '{}', at: Date.now() });
    const delForeign = await fetch(`${BASE}/api/notifications`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenB}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ids[0] }),
    });
    await delForeign.json().catch(() => ({}));
    const aRow = await admin.from('notifications').select('id').eq('id', ids[0]);
    check("foreign user can't delete A's row", (aRow.data || []).length === 1, (aRow.data || []).length === 1 ? 'row still exists' : 'ROW WAS DELETED!');

    // cleanup
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
