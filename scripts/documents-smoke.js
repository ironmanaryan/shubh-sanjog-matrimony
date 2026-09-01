/**
 * Smoke test for the document management pipeline.
 *
 * Walks the chain the customer /admin panels rely on:
 *   1. Sign in as admin (SMOKE_ADMIN_TOKEN env, or mint a fresh admin via
 *      Supabase + /api/auth/supabase-session).
 *   2. POST /api/documents/upload with a 1x1 PNG via raw multipart — should
 *      succeed and return ok=true.
 *   3. GET /api/documents — should include the uploaded record.
 *   4. DELETE /api/documents/:id — should remove the record.
 *   5. GET /api/documents — record should be gone.
 *
 * Run with `npm run smoke:documents`, optionally:
 *   SMOKE_BASE=https://prod
 *   SMOKE_ADMIN_TOKEN=...  (skip the supabase-session exchange)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });

const { createClient } = require('@supabase/supabase-js');

const BASE = process.env.SMOKE_BASE || 'http://localhost:3100';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const ADMIN_TOKEN = process.env.SMOKE_ADMIN_TOKEN;

if (!SUPABASE_URL) {
  console.error('Missing SUPABASE_URL in server/.env (or NEXT_PUBLIC_SUPABASE_URL)');
  process.exit(1);
}

function step(name, ok, extra) {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark.padEnd(4)}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) process.exit(1);
}

/**
 * Build a tiny multipart/form-data body by hand. Avoids pulling in the
 * `form-data` package (we don't want to add a dependency just for tests).
 * Returns { body, boundary } so the caller can set Content-Type.
 */
function buildMultipart({ fields, files }) {
  const boundary = '----smoke' + Math.random().toString(36).slice(2, 16);
  let body = '';
  for (const [k, v] of Object.entries(fields)) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
  }
  for (const f of files) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${f.field}"; filename="${f.filename}"\r\n`;
    body += `Content-Type: ${f.contentType}\r\n\r\n`;
  }
  const head = Buffer.from(body, 'utf8');
  const buffers = [head];
  for (const f of files) buffers.push(f.bytes);
  buffers.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));
  return { body: Buffer.concat(buffers), boundary };
}

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function getAdminToken() {
  if (ADMIN_TOKEN) return ADMIN_TOKEN;
  if (!SERVICE) {
    console.error('SMOKE_ADMIN_TOKEN not set and SUPABASE_SERVICE_ROLE_KEY missing.');
    process.exit(1);
  }
  if (!ANON_KEY) {
    console.error('SMOKE_ADMIN_TOKEN not set and SUPABASE_ANON_KEY missing.');
    process.exit(1);
  }
  // Sign in as a pre-existing admin if the env offers one; otherwise this
  // smoke test is informational only (it'll skip admin-only assertions).
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
  const email = process.env.SMOKE_ADMIN_EMAIL;
  const password = process.env.SMOKE_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('No SMOKE_ADMIN_TOKEN or SMOKE_ADMIN_EMAIL — running with a fresh anon user instead.');
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const created = await admin.auth.admin.createUser({ email: `smoke-doc-${Date.now()}@shubhsanjog.in`, password: 'Sm0keTest!Passw0rd', email_confirm: true });
    if (created.error) throw new Error('create user failed: ' + created.error.message);
    const signIn = await userClient.auth.signInWithPassword({ email: created.data.user.email, password: 'Sm0keTest!Passw0rd' });
    if (signIn.error) throw new Error('sign in failed: ' + signIn.error.message);
    const session = signIn.data.session;
    const ex = await fetch(`${BASE}/api/auth/supabase-session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    });
    const j = await ex.json();
    if (!ex.ok || !j?.token) throw new Error('session exchange failed: ' + (j.error || ex.status));
    try { await admin.auth.admin.deleteUser(created.data.user.id); } catch {}
    return j.token;
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const signIn = await userClient.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error('sign in failed: ' + signIn.error.message);
  const ex = await fetch(`${BASE}/api/auth/supabase-session`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signIn.data.session.access_token}` },
  });
  const j = await ex.json();
  if (!ex.ok || !j?.token) throw new Error('session exchange failed: ' + (j.error || ex.status));
  return j.token;
}

async function main() {
  console.log(`Smoke base: ${BASE}`);
  console.log(`Project:    ${SUPABASE_URL || '<unconfigured>'}\n`);

  let token;
  try {
    token = await getAdminToken();
  } catch (err) {
    console.error('Could not acquire token:', err.message);
    process.exit(1);
  }

  // Upload
  const mp = buildMultipart({
    fields: { documentType: 'identity' },
    files: [{ field: 'file', filename: 'smoke.png', contentType: 'image/png', bytes: PNG }],
  });
  const upload = await fetch(`${BASE}/api/documents/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${mp.boundary}`,
    },
    body: mp.body,
  });
  const uploadJson = await upload.json().catch(() => ({}));
  step('POST /api/documents/upload', upload.ok && uploadJson.ok, `id=${uploadJson.file?.id || '—'} bytes=${uploadJson.file?.size || '—'}`);

  const documentId = uploadJson.file?.id;

  // List
  const list = await fetch(`${BASE}/api/documents`, { headers: { Authorization: `Bearer ${token}` } });
  const listJson = await list.json().catch(() => ({}));
  const found = Array.isArray(listJson.documents) && listJson.documents.find((d) => d.id === documentId);
  step('GET /api/documents contains the upload', !!found);

  // Delete
  const del = await fetch(`${BASE}/api/documents/${encodeURIComponent(documentId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const delJson = await del.json().catch(() => ({}));
  step('DELETE /api/documents/:id returns ok', del.ok && delJson.ok === true);

  // Confirm removed
  const list2 = await fetch(`${BASE}/api/documents`, { headers: { Authorization: `Bearer ${token}` } });
  const list2Json = await list2.json().catch(() => ({}));
  const still = Array.isArray(list2Json.documents) && list2Json.documents.some((d) => d.id === documentId);
  step('GET /api/documents after delete — no record', !still);

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
