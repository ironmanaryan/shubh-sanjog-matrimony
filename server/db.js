// Storage router — Supabase-first (PostgreSQL) with SQLite fallback.
//
//   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL set -> Supabase PostgreSQL (primary)
//   otherwise                                   -> local SQLite (development fallback)
//
// The legacy MongoDB driver was removed: mongoose was never installed, so it
// could never have been selected at runtime, and keeping it forced the bundler
// to resolve a dependency that does not exist (breaking `next build`).
//
// RESILIENCE: if the Supabase primary is unreachable we degrade to SQLite so
// auth/dashboard endpoints keep answering. Set DB_STRICT=1 to fail fast.

const SUPABASE_CONNECT_TIMEOUT_MS = Number(process.env.SUPABASE_CONNECT_TIMEOUT_MS || 10_000);

const wrapper = {
  /** Active storage mode: 'supabase' | 'mongodb' | 'sqlite' | 'none' (before init). */
  _mode: 'none',
  /** Driver handle: supabase client or sqlite wrapper. */
  _db: null,

  /** True once init() succeeded — controllers use this to decide persistence. */
  isReady() {
    return Boolean(wrapper._db);
  },
};

function bindImpl(impl) {
  for (const key of Object.keys(impl)) {
    if (key === 'init' || key === 'hydrateStore') continue;
    const value = impl[key];
    wrapper[key] = typeof value === 'function' ? value.bind(impl) : value;
  }
}

/**
 * Bounded connection attempt — a dead primary must not hang server boot.
 */
async function connectWithTimeout(impl, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });
  const connecting = impl.init();
  try {
    return await Promise.race([connecting, timeout]);
  } finally {
    clearTimeout(timer);
    connecting.catch(() => {});
  }
}

/**
 * Select + initialize the storage engine. Priority:
 *   1) Supabase (when SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL is set) - primary for Vercel
 *   2) SQLite (local development fallback only, never bundled for Vercel)
 *      `sqlite`/`sqlite3` are NOT in production dependencies to avoid native
 *      node-gyp compilation on serverless. This fallback is dev-only.
 */
wrapper.init = async function init() {
  let impl = null;

  const hasSupabase =
    Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (hasSupabase) {
    const supabase = require('./db-supabase');
    try {
      wrapper._db = await connectWithTimeout(supabase, SUPABASE_CONNECT_TIMEOUT_MS);
      impl = supabase;
      wrapper._mode = 'supabase';
      console.log('[db] Connected to Supabase PostgreSQL.');
    } catch (err) {
      console.warn(`[db] Supabase unavailable (${err && err.message ? err.message : err}).`);
      if (process.env.DB_STRICT === '1') throw err;
      console.warn('[db] Falling back to next storage engine so the API stays reachable.');
    }
  }

  if (!impl) {
    // SQLite fallback is dev-only and excluded from Vercel production bundle.
    // `sqlite3` native addon completely removed from package.json to avoid
    // node-gyp compilation on serverless. Only attempt in local dev.
    // Use eval('require') to prevent Next.js bundler from statically including
    // the native module in the production build (moved to scripts/ for dev).
    if (process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production') {
      try {
        // eslint-disable-next-line no-eval
        const sqliteImpl = eval("require")('./db-sqlite');
        impl = sqliteImpl;
        wrapper._db = await impl.init();
        wrapper._mode = 'sqlite';
        console.log('[db] Using local SQLite (development fallback).');
      } catch (err) {
        console.warn('[db] SQLite fallback unavailable (dev-only, no native build):', err && err.message ? err.message : err);
      }
    }
    if (!impl) {
      // In production (Vercel) with no Supabase and no SQLite, run in degraded
      // mode with no DB - API will return fallback/seed data where possible.
      // This prevents `next build` from failing due to missing native module.
      console.warn('[db] No storage engine available (Supabase not configured, SQLite dev-only). Running without DB.');
      wrapper._mode = 'none';
      // Create a minimal no-op impl to keep controllers from crashing
      impl = {
        init: async () => null,
        hydrateStore: async () => {},
      };
      wrapper._db = {};
    }
  }

  bindImpl(impl);

  try {
    await impl.hydrateStore(wrapper._db);
  } catch {}

  return wrapper._db;
};

module.exports = wrapper;
