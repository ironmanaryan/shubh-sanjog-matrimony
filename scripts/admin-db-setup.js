// Creates/verifies the tables the admin auth system needs.
//
//   node scripts/admin-db-setup.js
//
// Idempotent — safe to re-run. Reads the connection string from DATABASE_URL
// (loaded from server/.env, falling back to .env.local / .env). Credentials are
// NEVER hardcoded here; an earlier version of this script shipped a plaintext
// database password and a Supabase personal access token in the repo.
//
// After applying supabase/admin_auth.sql it prints the resulting table state so
// you can confirm row-level security is off (the Next.js API reaches these
// tables with the service-role key, which bypasses RLS anyway, but leaving RLS
// enabled without policies would break the anon fallback).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, 'server', '.env') });
require('dotenv').config({ path: path.join(ROOT, '.env.local') });
require('dotenv').config({ path: path.join(ROOT, '.env') });

const { Client } = require('pg');

const TABLES = ['admin_users', 'admin_otps'];
const SQL_FILE = path.join(ROOT, 'supabase', 'admin_auth.sql');

function getConnectionString() {
  const raw = (process.env.DATABASE_URL || '').trim().replace(/^["']|["']$/g, '');
  if (!raw) return null;
  return raw;
}

async function main() {
  const connectionString = getConnectionString();
  if (!connectionString) {
    console.error(
      'DATABASE_URL is not set.\n' +
        'Add it to server/.env (or .env.local) and re-run. You can copy the\n' +
        'connection string from Supabase → Project Settings → Database.'
    );
    process.exit(1);
  }

  if (!fs.existsSync(SQL_FILE)) {
    console.error(`Migration file not found: ${SQL_FILE}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
  } catch (err) {
    console.error('Could not connect to the database:', err.message);
    console.error(
      'Check the host in DATABASE_URL. A single transposed character (e.g.\n' +
        'db.banrjons… instead of db.banrojs…) fails with getaddrinfo ENOTFOUND.'
    );
    process.exit(1);
  }

  try {
    await client.query(sql);
    console.log('applied  supabase/admin_auth.sql');
  } catch (err) {
    console.error('Migration failed:', err.message);
    await client.end().catch(() => {});
    process.exit(1);
  }

  const { rows } = await client.query(
    `SELECT tablename, rowsecurity FROM pg_tables
      WHERE schemaname = 'public' AND tablename = ANY($1::text[])
      ORDER BY tablename`,
    [TABLES]
  );

  console.log('\ntable                 rls');
  console.log('--------------------  -----');
  for (const table of TABLES) {
    const found = rows.find((r) => r.tablename === table);
    if (!found) {
      console.log(`${table.padEnd(20)}  MISSING`);
    } else {
      console.log(`${table.padEnd(20)}  ${found.rowsecurity ? 'ENABLED' : 'disabled'}`);
    }
  }

  const { rows: counts } = await client.query(
    `SELECT 'admin_users' AS t, count(*)::int AS n FROM admin_users
     UNION ALL SELECT 'admin_otps', count(*)::int FROM admin_otps`
  );
  console.log('');
  for (const row of counts) console.log(`${row.t.padEnd(20)}  ${row.n} row(s)`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
