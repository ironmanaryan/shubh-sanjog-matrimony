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
 *   1) Supabase (when SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL is set)
 *   2) SQLite (local development fallback)
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
    impl = require('./db-sqlite');
    wrapper._db = await impl.init();
    wrapper._mode = 'sqlite';
    console.log('[db] Using local SQLite (development fallback).');
  }

  bindImpl(impl);

  await impl.hydrateStore(wrapper._db);

  return wrapper._db;
};

module.exports = wrapper;
