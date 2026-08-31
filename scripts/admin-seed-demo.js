// Seeds the production admin_users row so the demo banner's Fill → flow works.
// Idempotent — safe to re-run.
//
// What it does:
//   - Inserts (or updates) one row in admin_users with:
//       username = "shubhadmin"
//       email    = "admin@demo.in"
//       password = bcrypt("demo123")  ← cost 10, matches the rest of the app
//   - Prints the resulting admin_users row so the operator can confirm.
//
// Why this exists:
//   The login form on /admin/login only authenticates against the admin_users
//   table. Adding a row with well-known demo credentials is the safe way to
//   enable the demo banner — it goes through the real bcrypt path, the JWT
//   issued is indistinguishable from one a real admin would get, and there is
//   no auth-middleware change that could leak into production. To remove the
//   demo account later, run the script with REMOVE=1.
//
// Usage:
//   node scripts/admin-seed-demo.js
//   REMOVE=1 node scripts/admin-seed-demo.js   # delete the demo row instead
//
// Environment:
//   DATABASE_URL must resolve to the Supabase Postgres connection string.
//   Read from server/.env, then .env.local, then .env — same precedence as
//   scripts/admin-db-setup.js.

const path = require('path');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, 'server', '.env') });
require('dotenv').config({ path: path.join(ROOT, '.env.local') });
require('dotenv').config({ path: path.join(ROOT, '.env') });

const DEMO_USERNAME = 'shubhadmin';
const DEMO_EMAIL = 'admin@demo.in';
const DEMO_PASSWORD = 'demo123';
const BCRYPT_COST = 10;

async function main() {
  const connectionString = (process.env.DATABASE_URL || '').trim().replace(/^["']|["']$/g, '');
  if (!connectionString) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
  } catch (err) {
    console.error('Could not connect:', err.message);
    process.exit(1);
  }

  try {
    const removeMode = process.env.REMOVE === '1';

    if (removeMode) {
      const del = await client.query(
        'DELETE FROM admin_users WHERE email = $1 OR username = $2 RETURNING id, username, email',
        [DEMO_EMAIL, DEMO_USERNAME]
      );
      console.log(`removed ${del.rowCount} demo row(s):`);
      for (const row of del.rows) console.log(`  ${row.username}  ${row.email}  ${row.id}`);
      if (del.rowCount === 0) console.log('  (none present already)');
      return;
    }

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST);

    const { rows: existing } = await client.query(
      'SELECT id, username, email FROM admin_users WHERE email = $1 OR username = $2 LIMIT 1',
      [DEMO_EMAIL, DEMO_USERNAME]
    );

    let row;
    if (existing.length > 0) {
      const upd = await client.query(
        `UPDATE admin_users
            SET password_hash = $1, email = COALESCE(email, $2), username = COALESCE(username, $3)
          WHERE id = $4
          RETURNING id, username, email`,
        [passwordHash, DEMO_EMAIL, DEMO_USERNAME, existing[0].id]
      );
      row = upd.rows[0];
      console.log(`updated existing row id=${row.id}`);
    } else {
      const ins = await client.query(
        `INSERT INTO admin_users (username, email, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE
           SET password_hash = EXCLUDED.password_hash
         RETURNING id, username, email`,
        [DEMO_USERNAME, DEMO_EMAIL, passwordHash]
      );
      row = ins.rows[0];
      console.log(`inserted new row id=${row.id}`);
    }

    console.log('\nDemo admin row now in admin_users:');
    console.log(`  username:  ${row.username}`);
    console.log(`  email:     ${row.email}`);
    console.log(`  password:  ${DEMO_PASSWORD}  (bcrypt cost ${BCRYPT_COST})`);
    console.log(`  id:        ${row.id}`);
    console.log('\nVerify on production:');
    console.log('  curl -i -X POST https://shubh-sanjog-matrimony.vercel.app/api/admin/login \\');
    console.log('    -H "Content-Type: application/json" \\');
    console.log('    -d \'{"identifier":"admin@demo.in","password":"demo123"}\'');
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
