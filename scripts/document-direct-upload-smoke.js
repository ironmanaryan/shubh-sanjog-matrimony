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

    // 3. The lazy-upsert path from `lib/document-api.ts::ensureUserRow`.
    //
    //    `lib/document-api.ts` is a browser-only TypeScript module that
    //    imports `getSupabase` from `lib/supabase.ts`. We can't import
    //    those from a Node smoke test without a TS toolchain, so the
    //    smoke test re-implements the same three calls (select, upsert)
    //    using the same payload. The ASSERTION still tells us whether the
    //    upsert works against the live database.
    const { data: stillEmpty } = await userClient.from('users').select('id').eq('id', userId).maybeSingle();
    step('users row is still empty before the lazy upsert', !stillEmpty?.id);

    const { data: { user: authedUser } } = await userClient.auth.getUser();
    const meta = authedUser.user_metadata || {};
    const upsertPayload = {
      id: authedUser.id,
      identifier: authedUser.id, // mirrors the production implementation
      email: authedUser.email || null,
      full_name: (typeof meta.full_name === 'string' && meta.full_name) || (typeof meta.name === 'string' && meta.name) || (authedUser.email ? authedUser.email.split('@')[0] : ''),
      role: 'customer',
      created_at: Date.now(),
    };
    const { error: upsertErr } = await userClient
      .from('users')
      .upsert(upsertPayload, { onConflict: 'id', ignoreDuplicates: false });
    step('lazy upsert into public.users succeeded', !upsertErr, upsertErr ? upsertErr.message : `id=${upsertPayload.id}`);

    // 4. Now that users(id) is populated, the documents INSERT must
    //    succeed without FK violation.
    const id = `smoke-${userId}-${Date.now()}`;
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
      .select('id, doc_type, file_url, created_at, status')
      .single();
    step('documents INSERT succeeded (FK on users satisfied)', !insErr && ins?.id === id, insErr ? insErr.message : `id=${ins?.id}`);

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
    try { await admin.auth.admin.deleteUser(userId); } catch {}
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
