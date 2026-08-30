// One-shot helper: push the server-side secrets this deployment needs into
// Vercel (Production / Preview / Development).
//
// Why this exists: `.env.local` and `server/.env` are gitignored, so none of
// the backend secrets ever reached Vercel. In production that meant
// `getJwtSecret()` threw on every request (server/secrets.js refuses to fall
// back to the dev key when VERCEL=1), so *every* authenticated API call
// returned 500 and Google sign-in could never complete.

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const seedPath = path.join(__dirname, '..', 'server', '.env.vercel-seed.json');
if (!fs.existsSync(seedPath)) {
  console.error('Missing server/.env.vercel-seed.json — generate it from server/.env first.');
  process.exit(1);
}

const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const ENVIRONMENTS = ['production', 'preview', 'development'];

function run(args, input) {
  return execFileSync('vercel', args, {
    input: input === undefined ? '' : input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
}

for (const [key, value] of Object.entries(seed)) {
  if (!value) {
    console.warn(`- ${key}: empty, skipping`);
    continue;
  }
  for (const env of ENVIRONMENTS) {
    // Remove any existing value first — `vercel env add` refuses duplicates.
    try {
      run(['env', 'rm', key, env, '--yes']);
    } catch {
      /* not present — fine */
    }
    try {
      const out = run(['env', 'add', key, env], value);
      console.log(`+ ${key} (${env}) ${out.trim().split('\n').pop()}`);
    } catch (err) {
      console.error(`! ${key} (${env}) failed:`, (err.stderr || err.message || '').trim());
    }
  }
}

console.log('Done. Run `vercel env ls` to confirm.');
