// Storage router — picks the persistence implementation from the environment.
//
//   MONGODB_URI set  -> MongoDB via Mongoose (production; PRD §1)
//   otherwise        -> legacy SQLite file (local development fallback)
//
// RESILIENCE: if MONGODB_URI is configured but the server is unreachable
// (e.g. laptop offline, Atlas IP not whitelisted during local preview), we
// DO NOT crash the API — we log a loud warning and degrade to SQLite so
// auth/dashboard endpoints keep answering ("Cannot reach the authentication
// service" happens when nothing listens on :4000; this prevents exactly that).
// Set DB_STRICT=1 to restore fail-fast behaviour (die if MongoDB is down).
//
// Both implementations expose the identical function surface, so controllers
// and routes are storage-agnostic. `_db` carries the driver handle for BOTH
// modes (mongoose connection for Mongo, sqlite handle for SQLite) so every
// controller's `if (db._db)` guard means "a real database is attached" and all
// writes persist inside the request that performs them (real-time CRUD).

const MONGO_CONNECT_TIMEOUT_MS = Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 10_000);

const wrapper = {
  /** Active storage mode: 'mongodb' | 'sqlite' | 'none' (before init). */
  _mode: 'none',
  /** Driver handle: mongoose.connection (Mongo) or the sqlite wrapper. */
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
 * Bounded connection attempt — a dead MongoDB URI must not hang server boot.
 * The abandoned mongoose promise gets a no-op catch so its eventual rejection
 * never becomes an unhandledRejection.
 */
async function connectMongoWithTimeout(mongo) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timed out after ${MONGO_CONNECT_TIMEOUT_MS}ms`)),
      MONGO_CONNECT_TIMEOUT_MS
    );
  });
  const connecting = mongo.init();
  try {
    return await Promise.race([connecting, timeout]);
  } finally {
    clearTimeout(timer);
    connecting.catch(() => {});
  }
}

/**
 * Select + initialize the storage engine. Never leaves the wrapper half-bound:
 * routes are mounted by server/index.js only after this resolves (or throws,
 * which only happens when BOTH MongoDB and the SQLite fallback are unusable).
 */
wrapper.init = async function init() {
  let impl = null;

  if (process.env.MONGODB_URI) {
    const mongo = require('./db-mongo');
    try {
      wrapper._db = await connectMongoWithTimeout(mongo);
      impl = mongo;
      wrapper._mode = 'mongodb';
      console.log('[db] Connected to MongoDB.');
    } catch (err) {
      console.warn(`[db] MongoDB unavailable (${err && err.message ? err.message : err}).`);
      if (process.env.DB_STRICT === '1') throw err;
      console.warn('[db] Falling back to local SQLite so the API stays reachable.');
    }
  }

  if (!impl) {
    impl = require('./db-sqlite');
    wrapper._db = await impl.init();
    wrapper._mode = 'sqlite';
    console.log('[db] Using local SQLite (development fallback).');
  }

  bindImpl(impl);

  // Pass the driver handle through: the SQLite implementation expects it as
  // its first argument (`db.all(...)`), while the Mongo driver ignores it.
  await impl.hydrateStore(wrapper._db);

  return wrapper._db;
};

module.exports = wrapper;
