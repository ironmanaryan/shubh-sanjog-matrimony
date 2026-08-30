// Verifies the Google sign-in entry point on a deployed URL.
//
// Two things matter and both used to be broken:
//   1. clicking "Sign in with Google" must land on accounts.google.com
//      (Supabase returns the authorize URL; nothing locally could 404 it)
//   2. while signed in, the header must render the account menu with the
//      user's real name/email — not the generic Login / Registration links

const path = require('path');
const { chromium } = require('playwright');

require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
const { createClient } = require('@supabase/supabase-js');

const BASE = process.env.SMOKE_BASE || 'https://shubh-sanjog-matrimony.vercel.app';
const EMAIL = `gcheck-${Date.now()}@shubhsanjog.in`;
const PASSWORD = 'Gcheck-Test!Passw0rd';

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
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  try {
    // ── 1. The Google button must reach Google ─────────────────────────────
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });

    const googleBtn = page
      .locator('button, a')
      .filter({ hasText: /sign in with google|continue with google|google/i })
      .first();

    const btnCount = await page
      .locator('button, a')
      .filter({ hasText: /google/i })
      .count();
    step('google button rendered on /login', btnCount > 0, `${btnCount} match(es)`);

    let reachedGoogle = false;
    let landedUrl = '';
    if (btnCount) {
      await Promise.all([
        page.waitForNavigation({ timeout: 45000 }).catch(() => {}),
        googleBtn.click().catch(() => {}),
      ]);
      await page.waitForTimeout(2500);
      landedUrl = page.url();
      reachedGoogle =
        /accounts\.google\.com/.test(landedUrl) ||
        /banrojskoitemzwosvfm\.supabase\.co\/auth\/v1\/authorize/.test(landedUrl);
      step('google click reaches an OAuth authorize page', reachedGoogle, landedUrl.slice(0, 120));
    }

    // ── 2. Signed-in header must show the real account ─────────────────────
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'GCheck User' },
    });
    if (createErr) throw createErr;
    userId = created.user.id;

    const { data: signedIn, error: signInErr } = await anon.auth.signInWithPassword({
      email: EMAIL,
      password: PASSWORD,
    });
    if (signInErr) throw signInErr;

    const fragment =
      `#access_token=${signedIn.session.access_token}` +
      `&expires_in=3600&refresh_token=${signedIn.session.refresh_token}` +
      `&token_type=bearer&type=magiclink`;

    await page.goto(`${BASE}/auth/complete${fragment}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(3500);

    // The signed-in state is asserted on the account trigger itself, not on
    // the absence of the word "Login".
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    // The header has three aria-haspopup="menu" buttons (nav: "More",
    // "Views", and the account). Pick the one whose text contains an email
    // — that's the account trigger, regardless of DOM order.
    const trigger = page
      .locator('header [aria-haspopup="menu"]')
      .filter({ hasText: /@/ })
      .first();
    const triggerCount = await trigger.count();
    step('account menu trigger present while signed in', triggerCount > 0);

    if (triggerCount) {
      await trigger.click();
      await page.waitForTimeout(1200);
      const menuText = (await page
        .locator('[role="menu"]')
        .filter({ hasText: /sign out|my dashboard|my biodata|account/i })
        .first()
        .innerText()
        .catch(() => ''))
        .replace(/\s+/g, ' ')
        .trim();
      const showsIdentity = /GCheck User|gcheck-/.test(menuText);
      step('account menu shows this user', showsIdentity, `"${menuText.slice(0, 120)}"`);
      step('account menu offers sign out', /sign out/i.test(menuText));
      await page.keyboard.press('Escape').catch(() => {});
    }

    step('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  } catch (err) {
    step('run', false, err.message);
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
