// Express application factory.
//
// Historically this file auto-started a listener, which meant the API could only
// ever run as a separate process on port 4000. That is why production broke:
// Vercel only deploys the Next.js app, so every API call from the live site fell
// back to `http://localhost:4000/api` — the *visitor's own machine*.
//
// `createApp()` now builds the app without listening. It is used by:
//   - server/index.js        -> standalone `node server/index.js` (local dev)
//   - app/api/[...path]/route.ts -> same-origin API inside the Next.js deployment
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const paths = require('./paths');

// Load `server/.env` then the repo-root `.env` / `.env.local`. dotenv never
// overrides variables that are already set, so Vercel's injected values win.
function loadEnv() {
  const candidates = [
    path.join(paths.serverDir, '.env'),
    path.join(paths.root, '.env.local'),
    path.join(paths.root, '.env'),
  ];
  for (const file of candidates) {
    try {
      // turbopackIgnore: these are environment-dependent runtime probes, not
      // bundled assets. Without the marker, Turbopack treats the dynamic path as
      // unanalyzable and ships the entire project in the serverless bundle.
      if (fs.existsSync(/* turbopackIgnore: true */ file)) dotenv.config({ path: file });
    } catch {
      /* ignore unreadable env files */
    }
  }
}

loadEnv();

const db = require('./db');

// ─── CORS ────────────────────────────────────────────────────────────────────
// The Next.js dev server runs on :3000 — always allowed. Extra origins
// (staging/preview frontends) can be added via CORS_ORIGIN as a comma-separated
// list. Requests with no Origin (same-origin navigations, curl, server-to-
// server) are always allowed since CORS does not apply to them.
const CORS_DEFAULT_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

function buildAllowedOrigins() {
  const configured = String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...CORS_DEFAULT_ORIGINS, ...configured]);
}

const corsOrigins = buildAllowedOrigins();

function corsOptions() {
  return {
    origin(origin, callback) {
      // No Origin header -> not a cross-origin browser request.
      if (!origin) return callback(null, true);
      if (corsOrigins.has(origin)) return callback(null, true);

      // Same-site deployments (API mounted under the site's own domain) should
      // never be blocked by CORS.
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '';
      if (siteUrl && origin.replace(/\/$/, '') === siteUrl.replace(/\/$/, '')) {
        return callback(null, true);
      }

      // Vercel preview deployments get a fresh hostname per branch.
      if (/\.vercel\.app$/.test(origin) && process.env.VERCEL === '1') {
        return callback(null, true);
      }

      if (process.env.NODE_ENV !== 'production') return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
}

/**
 * Build the Express application. Cheap and side-effect free apart from env
 * loading — safe to call once per process.
 */
function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Basic health — also reports which storage engine is live so "API up but
  // degraded" states are diagnosable at a glance.
  app.get('/api/health', (req, res) =>
    res.json({ ok: true, ts: Date.now(), db: db._mode, ready: db.isReady() })
  );

  // Ensure the uploads dir exists (best effort; cloud storage is primary).
  paths.ensureDir(paths.uploadsDir);

  // Mount routes BEFORE awaiting DB init: controllers guard every persistence
  // call (`db.isReady()` / `if (db._db)`) and wrap failures in try/catch, so the
  // API stays answerable (auth included) while storage is still connecting or
  // running degraded. A crash here is what used to leave port 4000 dark.
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

  return app;
}

// ─── Storage bootstrap ───────────────────────────────────────────────────────
// Serverless containers are reused between invocations, so `initDb()` must be
// idempotent and must memoise its promise — otherwise every request would
// re-run a full schema hydrate.
let dbInitPromise = null;

function initDb() {
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      try {
        const handle = await db.init();
        db._db = handle;
        return handle;
      } catch (err) {
        // Both engines failed. Keep serving read-only/degraded rather than
        // dying: a dead API is worse than a limited one.
        console.error(
          'DB init failed — starting in DEGRADED mode:',
          err && err.message ? err.message : err
        );
        return null;
      }
    })();
  }
  return dbInitPromise;
}

module.exports = { createApp, initDb, loadEnv };
