// End-to-end browser test of the sign-in round trip.
//
// A real Supabase session is minted with the service key (email + password),
// then handed to /auth/complete as a URL fragment — byte-for-byte the shape a
// Supabase magic-link email produces. From there the test asserts the things
// that used to break:
//
//   1. the fragment session is claimed (no bounce back to /login?error=…)
//   2. the header swaps "Login / Registration" for the signed-in account menu
//   3. the platform JWT is minted and cached
//   4. a protected page (/customer) is reachable
//   5. authenticated API calls succeed
//   6. the profile stub was created by the exchange
//   7. sign out clears both sessions

const path = require('path');
const { chromium } = require('playwright');

require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
const { createClient } = require('@supabase/supabase-js');

const BASE = process.env.SMOKE_BASE || 'http://localhost:3000';
const EMAIL = `e2e-${Date.now()}@shubhsanjog.in`;
const PASSWORD = 'E2e-Test!Passw0rd';

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

let failures = 0;
function step(name, ok, extra) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures += 1;
}

(async () => {
  let userId = null;
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  try {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'E2E Tester' },
    });
    if (createErr) throw createErr;
    userId = created.user.id;

    const { data: signedIn, error: signInErr } = await anon.auth.signInWithPassword({
      email: EMAIL,
      password: PASSWORD,
    });
    if (signInErr) throw signInErr;

    // ── 1. Hand the session to /auth/complete exactly as an email link does ──
    const fragment =
      `#access_token=${signedIn.session.access_token}` +
      `&expires_in=3600&refresh_token=${signedIn.session.refresh_token}` +
      `&token_type=bearer&type=magiclink`;

    await page.goto(`${BASE}/auth/complete${fragment}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(3000);

    const landed = page.url();
    step('fragment session claimed', !landed.includes('/login?error'), landed);
    step('redirected to a real destination', !landed.includes('/auth/'), landed);

    // ── 2. Header must show the account, not the login buttons ──────────────
    const headerText = (await page.locator('header').first().innerText()).replace(/\s+/g, ' ');
    const hasAccount = /E2E Tester|Sign out/i.test(headerText) || !/\bLogin\b/.test(headerText);
    step('header shows signed-in account', hasAccount, `"${headerText.slice(0, 100)}"`);

    // ── 3. Platform JWT minted and cached ───────────────────────────────────
    const token = await page.evaluate(() => localStorage.getItem('token'));
    step('API session token minted', Boolean(token), token ? `${token.slice(0, 20)}…` : 'empty');

    const cachedUser = await page.evaluate(() => localStorage.getItem('shubhSanjogUser'));
    step('cached user identity stored', Boolean(cachedUser && cachedUser.includes('@')));

    // ── 4. Protected page reachable ─────────────────────────────────────────
    await page.goto(`${BASE}/customer`, { waitUntil: 'networkidle', timeout: 60000 });
    step('protected /customer reachable', !page.url().includes('/login'), page.url());

    // ── 5. Authenticated API call ───────────────────────────────────────────
    const apiStatus = await page.evaluate(async () => {
      const res = await fetch('/api/profile', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      });
      return res.status;
    });
    step('authenticated API call succeeds', apiStatus === 200, `HTTP ${apiStatus}`);

    // ── 6. Profile stub created by the exchange ─────────────────────────────
    const { data: profileRows } = await admin
      .from('profiles')
      .select('id,is_completed,full_name')
      .eq('id', userId)
      .limit(1);
    step('profile stub created', Boolean(profileRows && profileRows.length), JSON.stringify(profileRows));

    // ── 7. Sign out ─────────────────────────────────────────────────────────
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const trigger = page.locator('header button[aria-haspopup="menu"]').last();
    await trigger.click().catch(() => {});
    const signOut = page.getByRole('menuitem', { name: /sign out/i }).first();
    if (await signOut.count()) {
      await signOut.click();
      await page.waitForTimeout(3500);
      const afterText = (await page.locator('header').first().innerText()).replace(/\s+/g, ' ');
      step('sign out shows login again', /\bLogin\b/i.test(afterText), `"${afterText.slice(0, 100)}"`);
      const afterToken = await page.evaluate(() => localStorage.getItem('token'));
      step('local token removed', !afterToken);
    } else {
      step('sign out control present', false, 'account menu did not open');
    }

    step('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  } catch (err) {
    step('e2e run', false, err.message);
  } finally {
    if (userId) {
      try {
        await admin.from('profiles').delete().eq('id', userId);
      } catch {
        /* best effort */
      }
      try {
        await admin.auth.admin.deleteUser(userId);
        console.log(`cleanup  removed ${EMAIL}`);
      } catch (e) {
        console.log(`cleanup  could not remove ${EMAIL}: ${e.message}`);
      }
    }
    await browser.close();
  }

  process.exit(failures ? 1 : 0);
})();
