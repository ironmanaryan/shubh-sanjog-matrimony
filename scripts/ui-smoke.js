// Client-side smoke test: load key pages in a real browser and fail on any
// uncaught exception or failed same-origin request. Catches the class of bug
// where the server renders fine but the page dies on hydration.

const { chromium } = require('playwright');

const BASE = process.env.SMOKE_BASE || 'http://localhost:3100';
const PAGES = ['/', '/login', '/register', '/plans', '/members'];

(async () => {
  const browser = await chromium.launch();
  let failures = 0;

  for (const path of PAGES) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Supabase logs a benign warning when there is no session to restore.
        if (/Auth session missing|Invalid JWT/i.test(text)) return;
        errors.push(`console: ${text}`);
      }
    });

    try {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 45000 });
      const headerText = await page.locator('header').first().innerText().catch(() => '');
      const ok = res && res.ok() && errors.length === 0;
      if (!ok) failures += 1;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${path} (HTTP ${res ? res.status() : 'n/a'}) header="${headerText.replace(/\s+/g, ' ').slice(0, 60)}"`);
      errors.slice(0, 3).forEach((e) => console.log(`        ${e}`));
    } catch (err) {
      failures += 1;
      console.log(`FAIL  ${path} — ${err.message}`);
    } finally {
      await context.close();
    }
  }

  await browser.close();
  process.exit(failures ? 1 : 0);
})();
