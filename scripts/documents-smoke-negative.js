/**
 * Negative-path probes for the documents upload route.
 *
 * These are the failure modes the customer used to see as raw HTML pages:
 *   1. multer LIMIT_FILE_SIZE → 413 "File too large" + structured JSON
 *   2. Unsupported mime       → 415 "Unsupported file type"
 *   3. Missing file field     → 400 with a friendly message
 *   4. Unauthenticated        → 401 with JSON, not a redirect
 *
 * Each probe asserts:
 *   - the response is JSON (the previous bug was that it was an HTML page)
 *   - the JSON has `{ success: false, error }` (the new error contract)
 *
 * Run with `SMOKE_BASE=http://... node scripts/documents-smoke-negative.js`.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });

const { createClient } = require('@supabase/supabase-js');

const BASE = process.env.SMOKE_BASE || 'http://localhost:4000';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL) {
  console.error('Missing SUPABASE_URL in server/.env');
  process.exit(1);
}

function pad(s, n) { return (s + ' '.repeat(n)).slice(0, n); }
function step(name, ok, detail) {
  console.log(`${(ok ? 'PASS' : 'FAIL').padEnd(4)}  ${pad(name, 64)}  ${detail || ''}`);
  if (!ok) process.exit(1);
}

function buildMultipart({ fields = {}, files = [] }) {
  const boundary = '----smoke' + Math.random().toString(36).slice(2, 14);
  let head = '';
  for (const [k, v] of Object.entries(fields)) {
    head += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
  }
  for (const f of files) {
    head += `--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.filename}"\r\nContent-Type: ${f.contentType}\r\n\r\n`;
  }
  const bodyParts = [Buffer.from(head, 'utf8')];
  for (const f of files) bodyParts.push(f.bytes);
  bodyParts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));
  return { body: Buffer.concat(bodyParts), boundary };
}

async function getToken() {
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const created = await admin.auth.admin.createUser({ email: `smoke-neg-${Date.now()}@shubhsanjog.in`, password: 'Sm0keTest!Passw0rd', email_confirm: true });
  if (created.error) throw new Error('create: ' + created.error.message);
  const signIn = await userClient.auth.signInWithPassword({ email: created.data.user.email, password: 'Sm0keTest!Passw0rd' });
  if (signIn.error) throw new Error('signin: ' + signIn.error.message);
  const ex = await fetch(`${BASE}/api/auth/supabase-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signIn.data.session.access_token}` },
  });
  const j = await ex.json();
  if (!ex.ok || !j?.token) throw new Error('session: ' + (j.error || ex.status));
  return {
    token: j.token,
    cleanup: async () => {
      try { await admin.auth.admin.deleteUser(created.data.user.id); } catch {}
    },
  };
}

async function sendMultipart({ token, fields, files }) {
  const mp = buildMultipart({ fields, files });
  return await fetch(`${BASE}/api/documents/upload`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': `multipart/form-data; boundary=${mp.boundary}`,
    },
    body: mp.body,
  });
}

async function readBody(res) {
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { text, json, ctype: res.headers.get('content-type') || '' };
}

async function main() {
  console.log(`Smoke base: ${BASE}\n`);

  let ctx;
  try { ctx = await getToken(); }
  catch (err) { console.error('Could not get a token:', err.message); process.exit(1); }

  try {
    // ── 1) LIMIT_FILE_SIZE ──────────────────────────────────────────────────
    // 6 MB of zeros (above the 5 MB cap)
    const big = Buffer.alloc(6 * 1024 * 1024, 0);
    const r1 = await sendMultipart({
      token: ctx.token,
      fields: { documentType: 'identity' },
      files: [{ field: 'file', filename: 'big.png', contentType: 'image/png', bytes: big }],
    });
    const b1 = await readBody(r1);
    step('LIMIT_FILE_SIZE returns 413 JSON', r1.status === 413 && b1.json?.success === false && /too large/i.test(b1.json?.error || ''), `status=${r1.status} body=${b1.text.slice(0, 80)}`);
    step('LIMIT_FILE_SIZE body is JSON (not HTML)', !/<!DOCTYPE|<html/i.test(b1.text), `ctype=${b1.ctype}`);

    // ── 2) Unsupported MIME ─────────────────────────────────────────────────
    // The mime allowlist is jpg/png/webp/pdf only — a .txt with image/png
    // declared would be filtered by the file extension check, so use an
    // image/png declared file that actually claims a non-image mimetype.
    const fake = Buffer.from('PK\x03\x04 fake zip\n');
    const r2 = await sendMultipart({
      token: ctx.token,
      fields: { documentType: 'identity' },
      files: [{ field: 'file', filename: 'evil.exe', contentType: 'application/octet-stream', bytes: fake }],
    });
    const b2 = await readBody(r2);
    step('Unsupported file type returns 415 JSON', r2.status === 415 && b2.json?.success === false && /unsupported/i.test(b2.json?.error || ''), `status=${r2.status} body=${b2.text.slice(0, 80)}`);
    step('Unsupported file body is JSON (not HTML)', !/<!DOCTYPE|<html/i.test(b2.text), `ctype=${b2.ctype}`);

    // ── 3) Missing file field ───────────────────────────────────────────────
    const r3 = await fetch(`${BASE}/api/documents/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.token}` },
      // Express body parsers will turn an empty multipart into no req.file.
      body: '--xx--\r\nContent-Disposition: form-data; name="documentType"\r\n\r\nidentity\r\n--xx--\r\n',
    });
    const b3 = await readBody(r3);
    step('Missing file returns 400 JSON', r3.status === 400 && b3.json?.success === false && /no file/i.test(b3.json?.error || ''), `status=${r3.status} body=${b3.text.slice(0, 80)}`);

    // ── 4) Unauthenticated ──────────────────────────────────────────────────
    const small = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const r4 = await sendMultipart({
      token: null,
      fields: { documentType: 'identity' },
      files: [{ field: 'file', filename: 'a.png', contentType: 'image/png', bytes: small }],
    });
    const b4 = await readBody(r4);
    step('Unauthenticated returns 401 JSON', r4.status === 401 && b4.json && /missing|auth|token/i.test(b4.json?.error || JSON.stringify(b4.json)), `status=${r4.status} body=${b4.text.slice(0, 80)}`);
    step('Unauthenticated body is JSON (not HTML)', !/<!DOCTYPE|<html/i.test(b4.text), `ctype=${b4.ctype}`);

    // ── 5) Random 500-class exception — ensure the catch-all error handler
    //    serialises it as JSON, not the default Express HTML page.
    //    We hit `/api/admin/audit-logs` without admin role; the audit-log
    //    route uses requireAdmin which throws PermissionError — verifies the
    //    Express error middleware path.
    const r5 = await fetch(`${BASE}/api/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${ctx.token}` },
    });
    const b5 = await readBody(r5);
    step('Forbidden admin route returns JSON (not HTML)', !/<!DOCTYPE|<html/i.test(b5.text), `status=${r5.status} body=${b5.text.slice(0, 80)}`);
  } finally {
    if (ctx?.cleanup) await ctx.cleanup();
  }

  console.log('\nDone.');
}

main().catch((err) => { console.error(err); process.exit(1); });
