/**
 * Verifies the DIRECT client → Supabase Storage upload path end-to-end.
 *
 * This is the path `lib/document-api.ts::uploadDocumentDirect` takes and is
 * now the PRIMARY upload route (the Express `/api/documents/upload` route is
 * the fallback only). Each probe goes through the same JS that the browser
 * will execute, against the same Supabase project.
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

  // Create a throwaway user so we get a real Supabase session.
  const email = `smoke-direct-${Date.now()}@shubhsanjog.in`;
  const password = 'Sm0keTest!Passw0rd';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error('create user failed: ' + created.error.message);
  const userId = created.data.user.id;

  // The documents.user_id FK points at users(id) — create that row too.
  const { error: userErr } = await admin.from('users').insert({
    id: userId,
    identifier: `smoke-${email}`,
    email,
    full_name: 'Smoke Direct',
    role: 'customer',
    created_at: Date.now(),
  });
  if (userErr) throw new Error('insert users: ' + userErr.message);

  const signIn = await userClient.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error('sign in failed: ' + signIn.error.message);
  const accessToken = signIn.data.session.access_token;
  console.log(`User ${userId.slice(0, 8)}… signed in.\n`);

  try {
    const ext = 'png';
    const objectPath = `${userId}/${Date.now()}.${ext}`;

    // 1. Direct upload to Supabase Storage (authed)
    const blob = new Blob([PNG], { type: 'image/png' });
    const { error: upErr } = await userClient.storage
      .from('documents')
      .upload(objectPath, blob, { upsert: true, contentType: 'image/png', cacheControl: '31536000' });
    step('authenticated upload to documents bucket', !upErr, upErr ? upErr.message : `${objectPath}`);

    // 2. Public URL must be reachable (no auth)
    const { data: pub } = userClient.storage.from('documents').getPublicUrl(objectPath);
    const head = await fetch(pub.publicUrl, { method: 'HEAD' });
    step('public URL reachable without auth', head.ok, `${pub.publicUrl} → ${head.status}`);

    // 3. Insert a documents row directly with the user client. RLS is OFF on
    //    documents (per supabase/schema.sql) so this should succeed for the
    //    signed-in user. The BEFORE trigger fills doc_type / file_url /
    //    created_at from canonical names.
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
    step('documents INSERT succeeded', !insErr && ins?.id === id, insErr ? insErr.message : `id=${ins?.id}`);

    // 4. The aliases must have been populated by the BEFORE trigger.
    step('triggers filled doc_type / file_url / created_at', ins?.doc_type === 'identity' && !!ins?.file_url && !!ins?.created_at,
      `doc_type=${ins?.doc_type} file_url=${ins?.file_url?.slice(0, 50)} created_at=${ins?.created_at}`);

    // 5. List the row back with a direct query.
    const { data: listed, error: listErr } = await userClient
      .from('documents')
      .select('id, original_name, file_url')
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle();
    step('documents SELECT returns the new row', !listErr && !!listed, listErr ? listErr.message : `listed=${!!listed}`);

    // 6. Delete the row.
    const { error: delErr } = await userClient.from('documents').delete().eq('id', id);
    step('documents DELETE succeeded', !delErr, delErr ? delErr.message : '');

    // 7. Cleanup storage object.
    const { error: storageDelErr } = await userClient.storage.from('documents').remove([objectPath]);
    step('storage.remove cleared the object', !storageDelErr, storageDelErr ? storageDelErr.message : '');

    console.log('\nDone — direct upload path is operational.');
  } finally {
    try { await admin.from('users').delete().eq('id', userId); } catch {}
    try { await admin.auth.admin.deleteUser(userId); } catch {}
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
