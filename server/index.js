const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load env from server/.env first, then the repo-root .env as a fallback, so
// `npm run server` works no matter the launch directory (dotenv never
// overrides variables that are already set).
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config();

const app = express();

// ─── CORS ────────────────────────────────────────────────────────────────────
// The Next.js dev server runs on http://localhost:3000 — always allowed.
// Extra origins (staging/production frontends) can be added via CORS_ORIGIN
// as a comma-separated list. Outside production, unlisted origins are still
// reflected so LAN previews keep working; in production they are blocked.
const CORS_DEFAULT_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const corsOrigins = [
  ...CORS_DEFAULT_ORIGINS,
  ...String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
];
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.includes(origin)) return callback(null, true);
      if (process.env.NODE_ENV !== 'production') return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);
app.use(express.json());

const db = require('./db');

// basic health — also reports which storage engine is live so the frontend
// team can diagnose "API up but degraded" states at a glance.
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now(), db: db._mode, ready: db.isReady() }));

// ensure uploads dir exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Mount routes BEFORE awaiting DB init: controllers already guard every
// persistence call (`db.isReady()` / `if (db._db)`) and wrap failures in
// try/catch, so the API can answer (auth included) even while storage is
// still connecting or running degraded. A crash here is what used to leave
// port 4000 dark and trigger "Cannot reach the authentication service".
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/customer', require('./routes/customer'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/inquiries', require('./routes/inquiries'));

(async () => {
  // initialize DB (MongoDB with automatic SQLite fallback — see db.js)
  try {
    const _db = await db.init();
    db._db = _db;
  } catch (err) {
    // Both engines failed. Keep serving read-only/degraded rather than dying:
    // a dead API is worse than a limited one for local preview and demos.
    console.error('DB init failed — starting in DEGRADED mode:', err && err.message ? err.message : err);
  }

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () =>
    console.log(`Shubh-Sanjog API listening on port ${PORT} [storage: ${db._mode}${db.isReady() ? '' : ' (degraded)'}]`)
  );
})();
