// End-to-end auth smoke test.
//
// Proves the full chain that Google sign-in depends on:
//   Supabase access token -> POST /api/auth/supabase-session -> platform JWT
//   -> JWT accepted by every protected Express route.
//
// It mints a throwaway Supabase user (email + password, email_confirm: true),
// signs in, exchanges, calls a protected endpoint, then deletes the user.

require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });

const { createClient } = require('@supabase/supabase-js');

const BASE = process.env.SMOKE_BASE || 'http://localhost:3100';
const EMAIL = `smoke-${Date.now()}@shubhsanjog.in`;
const PASSWORD = 'Sm0keTest!Passw0rd';

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const user = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function step(name, ok, extra) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) process.exitCode = 1;
}

(async () => {
  let createdId = null;

  try {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Smoke Test' },
    });
    if (createErr) throw createErr;
    createdId = created.user.id;
    step('create Supabase user', true, createdId);

    const { data: signedIn, error: signInErr } = await user.auth.signInWithPassword({
      email: EMAIL,
      password: PASSWORD,
    });
    if (signInErr) throw signInErr;
    const accessToken = signedIn.session.access_token;
    step('sign in (Supabase access token)', Boolean(accessToken));

    // 1) Exchange — this is the call that returned 500 in production.
    const exchangeRes = await fetch(`${BASE}/api/auth/supabase-session`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const exchangeJson = await exchangeRes.json().catch(() => ({}));
    step('POST /api/auth/supabase-session', exchangeRes.ok && Boolean(exchangeJson.token), `HTTP ${exchangeRes.status}`);

    // 2) The minted JWT must unlock a protected route.
    const jwt = exchangeJson.token;
    if (jwt) {
      const profileRes = await fetch(`${BASE}/api/profile`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      step('GET /api/profile with platform JWT', profileRes.ok, `HTTP ${profileRes.status}`);

      const customerRes = await fetch(`${BASE}/api/customer/onboarding-status`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      step('GET /api/customer/onboarding-status with platform JWT', customerRes.ok, `HTTP ${customerRes.status}`);
    }

    // 3) The raw Supabase token must also be accepted (the documented fallback).
    const supabaseTokenRes = await fetch(`${BASE}/api/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    step('GET /api/profile with raw Supabase token', supabaseTokenRes.ok, `HTTP ${supabaseTokenRes.status}`);

    // 4) A garbage token must be rejected, not 500.
    const badRes = await fetch(`${BASE}/api/profile`, {
      headers: { Authorization: 'Bearer not-a-real-token' },
    });
    step('invalid token rejected', badRes.status === 401, `HTTP ${badRes.status}`);

    // 5) No token at all must be rejected, not 500.
    const anonRes = await fetch(`${BASE}/api/profile`);
    step('missing token rejected', anonRes.status === 401, `HTTP ${anonRes.status}`);
  } catch (err) {
    step('smoke run', false, err.message);
  } finally {
    if (createdId) {
      await admin.auth.admin.deleteUser(createdId).catch(() => {});
      console.log(`cleanup  deleted ${EMAIL}`);
    }
  }
})();
