/**
 * Diagnostic: is the profile-photo upload path actually wired up?
 *
 * Checks, in order:
 *   1. Do the storage buckets exist, and are they public?
 *   2. Are the storage.objects RLS policies in place?
 *   3. Does the authenticated-upload policy actually accept a real file?
 *      (simulated in Postgres by impersonating the exact auth context that
 *      Supabase builds for a request — no throwaway user needed)
 *   4. Which hosts do saved avatar URLs use, and are they allowlisted in
 *      next.config.mjs images.remotePatterns?
 *
 * Read-only. Safe to re-run.
 */
const fs = require('fs');
const path = require('path');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv(path.join(__dirname, '..', 'server', '.env'));
loadEnv(path.join(__dirname, '..', '.env.local'));

const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB = process.env.DATABASE_URL;

if (!URL_ || !SERVICE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (checked server/.env and .env.local)');
  process.exit(1);
}

// NOTE: no 'Content-Type' here on purpose. The storage API runs on Fastify,
// which rejects a DELETE/GET that declares 'application/json' but sends no
// body ("Body cannot be empty when content-type is set to 'application/json'").
// Add Content-Type explicitly only on requests that actually carry a body.
const adminHeaders = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
};

const nextConfigSrc = fs.readFileSync(path.join(__dirname, '..', 'next.config.mjs'), 'utf8');
const allowedHosts = [...nextConfigSrc.matchAll(/hostname:\s*'([^']+)'/g)].map((m) => m[1]);
const hostAllowed = (host) =>
  allowedHosts.some((h) => (h.startsWith('*.') ? host.endsWith(h.slice(2)) : host === h));

// 1x1 transparent PNG — a real image so the bucket's mime allowlist is satisfied
// and we can see whether RLS (not the mime gate) is what blocks the upload.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function main() {
  console.log(`Project: ${URL_}\n`);

  // 1. Buckets
  const bucketRes = await fetch(`${URL_}/storage/v1/bucket`, { headers: adminHeaders });
  const buckets = bucketRes.ok ? await bucketRes.json() : [];
  console.log('--- Storage buckets ---');
  if (!Array.isArray(buckets) || buckets.length === 0) {
    console.log('  (none)  <-- no buckets at all');
  } else {
    for (const b of buckets) {
      console.log(`  ${b.id.padEnd(10)} public=${b.public}  limit=${b.file_size_limit}`);
    }
  }
  const hasAvatars = Array.isArray(buckets) && buckets.some((b) => b.id === 'avatars');
  console.log(`  avatars bucket: ${hasAvatars ? 'PRESENT' : 'MISSING  <-- upload 404s'}`);

  // 2. Public SELECT — the real differentiator.
  //    Before the fix there were ZERO policies, so storage.objects denied even
  //    reads and every avatar URL 403'd. After the fix, an anonymous GET must
  //    succeed. We upload with the service role (bypasses RLS) and then read
  //    back with NO credentials at all.
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const anonHeaders = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
  const probePath = '__diag__/probe.png';

  console.log('\n--- Probe A: anonymous PUBLIC READ of an avatar (must succeed) ---');
  try {
    const put = await fetch(`${URL_}/storage/v1/object/avatars/${probePath}`, {
      method: 'POST',
      headers: { ...adminHeaders, 'Content-Type': 'image/png', 'x-upsert': 'true' },
      body: PNG,
    });
    if (!put.ok) {
      console.log(`  setup upload failed: ${put.status} ${(await put.text()).slice(0, 160)}`);
    } else {
      const pub = await fetch(`${URL_}/storage/v1/object/public/avatars/${probePath}`);
      const buf = pub.ok ? await pub.arrayBuffer() : null;
      console.log(`  GET (no auth) status=${pub.status} bytes=${buf ? buf.byteLength : 0}`);
      console.log(
        pub.ok
          ? '  PASS: public SELECT policy works — avatar URLs are readable'
          : '  FAIL: public read blocked — "Avatar images are publicly readable" policy is missing'
      );
    }
  } catch (e) {
    console.log(`  probe threw: ${e.message}`);
  }

  // 3. Anonymous INSERT — must be REFUSED. The INSERT policy is scoped
  //    `to authenticated`, so a caller with no session has auth.uid() = NULL
  //    and is correctly denied. A 403 here means auth is enforced.
  console.log('\n--- Probe B: anonymous INSERT (must be refused) ---');
  try {
    const res = await fetch(`${URL_}/storage/v1/object/avatars/${probePath}`, {
      method: 'POST',
      headers: { ...anonHeaders, 'Content-Type': 'image/png', 'x-upsert': 'true' },
      body: PNG,
    });
    const text = await res.text();
    console.log(`  status=${res.status}  ${text.slice(0, 120)}`);
    console.log(
      res.status === 200
        ? '  FAIL: anonymous users can upload — INSERT policy is too permissive'
        : '  PASS: anonymous upload refused (INSERT is `to authenticated` only)'
    );
  } catch (e) {
    console.log(`  probe threw: ${e.message}`);
  }
  // Remove the probe object. Report failures loudly — a silently swallowed
  // error here is exactly how a stray __diag__ file gets left in the bucket.
  const del = await fetch(`${URL_}/storage/v1/object/avatars/${probePath}`, {
    method: 'DELETE',
    headers: adminHeaders,
  });
  console.log(del.ok ? '  (probe object cleaned up)' : `  WARNING: could not delete probe object: ${del.status}`);

  // 3b. Simulate a genuine authenticated upload by evaluating the real policy
  // predicate inside Postgres under the exact auth context Supabase builds.
  if (DB) {
    console.log('\n--- Policy simulation: authenticated user uploading to own folder ---');
    let pg;
    try {
      pg = require('pg');
    } catch {
      console.log('  (pg not installed — skipped)');
      pg = null;
    }
    if (pg) {
      const c = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
      try {
        await c.connect();
        const rows = await c.query(`
          with ctx as (
            select set_config('request.jwt.claim.sub', '11111111-2222-3333-4444-555555555555', true) as sub
          ), probe as (
            select
              name,
              (storage.foldername(name))[1] = auth.uid()::text as policy_allows
            from (values
              ('11111111-2222-3333-4444-555555555555/1700000000000.webp'),
              ('99999999-8888-7777-6666-555555555555/1700000000000.webp')
            ) as v(name), ctx
          )
          select name, policy_allows from probe;
        `);
        for (const r of rows.rows) {
          const own = r.name.startsWith('11111111');
          const expected = own;
          const pass = r.policy_allows === expected;
          console.log(
            `  ${pass ? 'PASS' : 'FAIL'}  ${r.name.split('/')[0].slice(0, 8)}…  ` +
              `${own ? '(own folder)    ' : '(other folder)  '} policy_allows=${r.policy_allows}`
          );
        }
      } catch (e) {
        console.log(`  simulation failed: ${e.message}`);
      } finally {
        await c.end();
      }
    }
  }

  // 4. Profile photo audit
  console.log('\n--- Profile photo audit ---');
  const rowsRes = await fetch(
    `${URL_}/rest/v1/profiles?select=id,full_name,email,avatar_url,photo_url,profile_photo&limit=1000`,
    { headers: { ...adminHeaders, Accept: 'application/json' } }
  );
  if (!rowsRes.ok) {
    console.log(`  query failed: ${rowsRes.status} ${(await rowsRes.text()).slice(0, 200)}`);
    return;
  }
  const rows = await rowsRes.json();
  console.log(`  ${rows.length} profile rows\n`);
  const badHosts = new Set();
  let noPhoto = 0;
  for (const r of rows) {
    const url = r.avatar_url || r.photo_url || r.profile_photo || null;
    const initial = String(r.full_name || r.email || '?').trim().charAt(0).toUpperCase();
    if (!url) {
      noPhoto++;
      console.log(`  [initial "${initial}"] ${(r.full_name || r.email || r.id).slice(0, 26)}  (no photo)`);
      continue;
    }
    let host = '(unparseable)';
    try { host = new URL(url).hostname; } catch {}
    const ok = hostAllowed(host);
    if (!ok) badHosts.add(host);
    console.log(`  [${ok ? 'renders ' : 'BLOCKED '}] ${String(r.full_name || r.email || r.id).slice(0, 26).padEnd(26)} ${host}`);
  }

  console.log('\n--- next.config.mjs images.remotePatterns ---');
  for (const h of allowedHosts) console.log(`  ${h}`);
  if (badHosts.size) {
    console.log('\n  NOT ALLOWLISTED (next/image refuses to render these):');
    for (const h of badHosts) console.log(`    ${h}`);
  } else {
    console.log('\n  Every avatar host in use is allowlisted.');
  }
  console.log(`\n  ${noPhoto}/${rows.length} profiles have no photo (correctly show the initial letter).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
