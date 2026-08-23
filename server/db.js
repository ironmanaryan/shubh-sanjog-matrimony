// Storage router — picks the persistence implementation from the environment.
//
//   MONGODB_URI set  -> MongoDB via Mongoose (production; PRD §1)
//   otherwise        -> legacy SQLite file (local development fallback)
//
// Both implementations expose the identical function surface, so controllers
// and routes are storage-agnostic. `_db` carries the driver handle for BOTH
// modes (mongoose connection for Mongo, sqlite handle for SQLite) so every
// controller's `if (db._db)` guard means "a real database is attached" and all
// writes persist inside the request that performs them (real-time CRUD).
let impl;
let mode;
if (process.env.MONGODB_URI) {
  mode = 'mongodb';
  impl = require('./db-mongo');
} else {
  mode = 'sqlite';
  console.warn('[db] MONGODB_URI not set — falling back to local SQLite (development only).');
  impl = require('./db-sqlite');
}

const wrapper = {
  _mode: mode,
  /** Driver handle: mongoose.connection (Mongo) or the sqlite wrapper. */
  _db: null,
};

for (const key of Object.keys(impl)) {
  if (key === 'init' || key === 'hydrateStore') continue;
  const value = impl[key];
  wrapper[key] = typeof value === 'function' ? value.bind(impl) : value;
}

wrapper.init = async function init() {
  const handle = await impl.init();
  wrapper._db = handle;
  return handle;
};

wrapper.hydrateStore = async function hydrateStore(handle) {
  // Pass the driver handle through: the SQLite implementation expects it as
  // its first argument (`db.all(...)`), while the Mongo driver ignores it.
  return impl.hydrateStore(handle || wrapper._db);
};

/** True once init() succeeded — controllers use this to decide persistence. */
wrapper.isReady = function isReady() {
  return Boolean(wrapper._db);
};

module.exports = wrapper;
