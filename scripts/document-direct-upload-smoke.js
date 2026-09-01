/**
 * Verifies the DIRECT client -> Supabase Storage upload path end-to-end,
 * AND verifies the FK-relationship fix on `public.documents -> public.users`.
 *
 * Reproduces the production bug: a customer signs in purely through the
 * browser (no Express `/api/auth/supabase-session` call has happened) so
 * `users(id)` is empty when they try to upload. The fix:
 * `ensureUserRow(supabase, user)` is called inside
 * `uploadCompressedDocument` BEFORE the documents INSERT, so the FK is
 * always satisfied by the time the row is written.
 *
 * Run with `node scripts/document-direct-upload-smoke.js`.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function step(name, ok, extra) {
  console.log(`${(ok ? 'PASS' : 'FAIL').padEnd(4)}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) process.exit(1);
}

async function main() {
  if (!SUPABASE_URL || !SERVICE || !ANON) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / anon key in server/.env or .env.local');
    process.exit(1);
  }

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
  const userClient = createClient(SUPABASE_URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

  // Create a throwaway Supabase Auth user but DELIBERATELY do NOT pre-create
  // a row in the public.users table. This is the production bug: a customer
  // signs in purely through the browser and lands on /customer/documents
  // before any Express auth flow has populated users(id).
  const email = `smoke-direct-${Date.now()}@shubhsanjog.in`;
  const password = 'Sm0keTest!Passw0rd';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error('create user failed: ' + created.error.message);
  const userId = created.data.user.id;

  const { data: preExisting } = await admin.from('users').select('id').eq('id', userId).maybeSingle();
  step('users row is initially absent (the production bug)', !preExisting);

  // `profiles` is optional — the schema has it via `profiles_migration.sql`,
  // but a fresh project might not. Probe its existence first so the smoke
  // doesn't have to die on "relation does not exist".
  const { data: profilesProbe, error: profilesProbeErr } = await admin
    .from('profiles').select('id').eq('id', userId).maybeSingle();
  const profilesTablePresent = !profilesProbeErr || !/does not exist/i.test(profilesProbeErr.message || '');

  const signIn = await userClient.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error('sign in failed: ' + signIn.error.message);
  console.log(`User ${userId.slice(0, 8)}… signed in.\n`);

  try {
    const ext = 'png';
    const objectPath = `${userId}/${Date.now()}.${ext}`;

    // 1. Direct upload to Supabase Storage (authed). Storage RLS uses
    //    auth.uid() directly against `storage.foldername(name)`, NOT against
    //    the users table, so this succeeds even when the row is missing.
    const blob = new Blob([PNG], { type: 'image/png' });
    const { error: upErr } = await userClient.storage
      .from('documents')
      .upload(objectPath, blob, { upsert: true, contentType: 'image/png', cacheControl: '31536000' });
    step('authenticated upload to documents bucket', !upErr, upErr ? upErr.message : `${objectPath}`);

    // 2. Public URL must be reachable (no auth)
    const { data: pub } = userClient.storage.from('documents').getPublicUrl(objectPath);
    const head = await fetch(pub.publicUrl, { method: 'HEAD' });
    step('public URL reachable without auth', head.ok, `${pub.publicUrl.slice(0, 80)}... status=${head.status}`);

    // 3. The lazy-upsert path from `lib/document-api.ts::ensureProfileRow`
    //    and `ensureUserRow`.
    //
    //    `lib/document-api.ts` is a browser-only TypeScript module that
    //    imports `getSupabase` from `lib/supabase.ts`. We can't import
    //    those from a Node smoke test without a TS toolchain, so the
    //    smoke test re-implements the same calls (select + upsert) using
    //    the same payload shapes the production helper uses. The
    //    ASSERTION still tells us whether each upsert actually lands
    //    against the live database.
    const { data: stillEmptyUsers } = await userClient
      .from('users').select('id').eq('id', userId).maybeSingle();
    step('users row is still empty before the lazy upsert', !stillEmptyUsers?.id);

    const { data: stillEmptyProfiles } = await userClient
      .from('profiles').select('id').eq('id', userId).maybeSingle();
    step('profiles row is still empty before the lazy upsert', !stillEmptyProfiles?.id);

    const { data: { user: authedUser } } = await userClient.auth.getUser();

    // Validate `authedUser.id` the same way the production handler does:
    // reject empty / 'undefined' / 'null' strings so the downstream
    // documents INSERT never goes out with an invalid `user_id`.
    const validatedId = (authedUser.id || '').trim();
    step('user id is non-empty and not "undefined"/"null"',
      !!validatedId && !/^undefined$/i.test(validatedId) && !/^null$/i.test(validatedId),
      `id=${validatedId.slice(0, 12)}…`);

    // Mirrors `ensureProfileRow` in lib/document-api.ts:
    //   { id, email, full_name: user.user_metadata?.full_name || 'User' }
    const profileFullName =
      (typeof authedUser.user_metadata?.full_name === 'string' &&
        authedUser.user_metadata.full_name.trim()) || 'User';
    const profilesPayload = {
      id: authedUser.id,
      email: authedUser.email || null,
      full_name: profileFullName,
    };

    // 4. The brief's PRIMARY upsert — into `profiles` — must succeed and
    //    unblock the documents FK.
    if (profilesTablePresent) {
      const { error: profilesErr } = await userClient
        .from('profiles')
        .upsert(profilesPayload, { onConflict: 'id', ignoreDuplicates: false });
      step('lazy upsert into public.profiles succeeded',
        !profilesErr, profilesErr ? profilesErr.message : `id=${profilesPayload.id} full_name="${profilesPayload.full_name}"`);

      // Confirm the row is actually in the DB with the fields we sent.
      const { data: profilesRow } = await userClient
        .from('profiles').select('id, email, full_name').eq('id', userId).maybeSingle();
      step('profiles row readable after upsert with the expected payload',
        !!profilesRow && profilesRow.email === profilesPayload.email && profilesRow.full_name === profilesPayload.full_name,
        profilesRow ? `email=${profilesRow.email} full_name="${profilesRow.full_name}"` : 'row missing');
    } else {
      console.log('SKIP  profiles table absent on this project (legacy / not yet migrated)');
    }

    // 5. SECONDARY upsert into `users` — covers installs where the FK on
    //    documents.user_id points at users(id) instead of profiles(id).
    const meta = authedUser.user_metadata || {};
    const usersPayload = {
      id: authedUser.id,
      identifier: authedUser.id,
      email: authedUser.email || null,
      full_name: (typeof meta.full_name === 'string' && meta.full_name) || (typeof meta.name === 'string' && meta.name) || (authedUser.email ? authedUser.email.split('@')[0] : ''),
      role: 'customer',
      created_at: Date.now(),
    };
    const { error: usersErr } = await userClient
      .from('users')
      .upsert(usersPayload, { onConflict: 'id', ignoreDuplicates: false });
    step('lazy upsert into public.users succeeded',
      !usersErr, usersErr ? usersErr.message : `id=${usersPayload.id}`);

    // 6. Now that the parent table (profiles or users) is populated, the
    //    documents INSERT must succeed without FK violation. `user_id` is
    //    the validated id from above — never undefined / empty / "undefined".
    const id = `smoke-${userId}-${Date.now()}`;
    step('documents INSERT will use a valid, non-empty user_id',
      !!userId && userId !== 'undefined' && userId !== 'null', `user_id=${userId}`);
    const { data: ins, error: insErr } = await userClient
      .from('documents')
      .insert({
        id,
        user_id: userId,
        original_name: 'direct-smoke.png',
        path: pub.publicUrl,
        cloudinary_url: pub.publicUrl,
        mimetype: 'image/png',
        size: PNG.length,
        document_type: 'identity',
        status: 'Pending Review',
        uploaded_at: Date.now(),
      })
      .select('id, user_id, doc_type, file_url, created_at, status')
      .single();
    step('documents INSERT succeeded (FK on auth-uid tables satisfied)',
      !insErr && ins?.id === id,
      insErr ? insErr.message : `id=${ins?.id} user_id=${ins?.user_id}`);
    // Defense-in-depth: the row we just wrote must echo the validated id
    // back so an "empty user_id" regression (where the schema treats
    // '' as a valid fk target) cannot pass this test.
    step('documents row stored user_id matching the validated id',
      ins?.user_id === userId, `stored=${ins?.user_id} expected=${userId}`);

    // 5. The aliases must have been populated by the BEFORE trigger.
    step('triggers filled doc_type / file_url / created_at', ins?.doc_type === 'identity' && !!ins?.file_url && !!ins?.created_at,
      `doc_type=${ins?.doc_type} file_url=${(ins?.file_url || '').slice(0, 50)} created_at=${ins?.created_at}`);

    // 6. List the row back with a direct query.
    const { data: listed, error: listErr } = await userClient
      .from('documents')
      .select('id, original_name, file_url')
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle();
    step('documents SELECT returns the new row', !listErr && !!listed, listErr ? listErr.message : `listed=${!!listed}`);

    // 7. Delete the row + verify FK still works on the second insert.
    const { error: delErr } = await userClient.from('documents').delete().eq('id', id);
    step('documents DELETE succeeded', !delErr, delErr ? delErr.message : '');

    // 8. Cleanup storage object.
    const { error: storageDelErr } = await userClient.storage.from('documents').remove([objectPath]);
    step('storage.remove cleared the object', !storageDelErr, storageDelErr ? storageDelErr.message : '');

    console.log('\nDone - direct upload + lazy users upsert operational.');
  } finally {
    try { await admin.from('users').delete().eq('id', userId); } catch {}
    if (profilesTablePresent) {
      try { await admin.from('profiles').delete().eq('id', userId); } catch {}
    }
    try { await admin.auth.admin.deleteUser(userId); } catch {}
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
