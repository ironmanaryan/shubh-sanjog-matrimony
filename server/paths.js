// Filesystem anchors for the API.
//
// The same server code now runs in two very different ways:
//
//   1. Standalone:  `node server/index.js`          -> __dirname === <root>/server
//   2. Bundled:     Next.js route handler on Vercel -> __dirname is rewritten to
//                   something inside `.next/server`, so `__dirname`-relative
//                   paths silently point at the wrong place (or at /).
//
// To keep uploads, the SQLite file and dotenv loading stable across both, every
// path is derived from the *project root* instead of `__dirname`.
//
// Root resolution order:
//   - `SERVER_ROOT` env override (escape hatch)
//   - nearest ancestor of cwd containing package.json
//   - nearest ancestor of this file's directory containing package.json

const path = require('path');
const fs = require('fs');

function findRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 12; i += 1) {
    try {
      // turbopackIgnore: runtime directory probe; see server/app.js for details.
      if (fs.existsSync(/* turbopackIgnore: true */ path.join(dir, 'package.json'))) return dir;
    } catch {
      /* keep walking */
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

const ROOT =
  process.env.SERVER_ROOT ||
  findRoot(process.cwd()) ||
  findRoot(__dirname);

/** Absolute project root (the directory holding package.json). */
const root = ROOT;

/** <root>/server */
const serverDir = path.join(ROOT, 'server');

/** <root>/server/uploads — filesystem fallback when Cloudinary is not configured. */
const uploadsDir = path.join(serverDir, 'uploads');

/**
 * Private per-user document storage.
 *
 * On Vercel the project directory is read-only, so uploads must land in the
 * only writable location: /tmp. They are ephemeral, which is acceptable because
 * Cloudinary is the real destination whenever it is configured.
 */
const privateUploadsDir = isWritable(uploadsDir)
  ? path.join(uploadsDir, 'private')
  : path.join('/tmp', 'shubh-sanjog', 'uploads', 'private');

const receiptUploadsDir = isWritable(uploadsDir)
  ? path.join(uploadsDir, 'receipts')
  : path.join('/tmp', 'shubh-sanjog', 'uploads', 'receipts');

/** <root>/server/data/database.sqlite */
const sqliteDbPath = path.join(serverDir, 'data', 'database.sqlite');

function isWritable(dir) {
  try {
    fs.mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });
    fs.accessSync(/* turbopackIgnore: true */ dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });
  } catch {
    /* best effort — cloud storage is the primary path */
  }
  return dir;
}

module.exports = {
  root,
  serverDir,
  uploadsDir,
  privateUploadsDir,
  receiptUploadsDir,
  sqliteDbPath,
  ensureDir,
  isWritable,
};
