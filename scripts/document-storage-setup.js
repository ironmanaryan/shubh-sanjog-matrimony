/**
 * Applies supabase/storage_documents.sql over a direct Postgres connection.
 * Idempotent — safe to re-run.
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const SQL_FILE = path.join(__dirname, '..', 'supabase', 'storage_documents.sql');

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error(
      'Missing DATABASE_URL.\n' +
        'Add it to server/.env (Supabase Dashboard → Project Settings → Database → Connection string → URI).'
    );
    process.exit(1);
  }

  let pg;
  try {
    pg = require('pg');
  } catch {
    console.error('The `pg` package is required. Run: npm install');
    process.exit(1);
  }

  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });

  await client.connect();
  const { rows } = await client.query('select current_database() as db, current_user as usr');
  console.log(`Connected to ${rows[0].db} as ${rows[0].usr}\n`);

  try {
    await client.query(sql);
    console.log('Applied supabase/storage_documents.sql');
  } catch (err) {
    console.error(`\nFailed to apply SQL: ${err.message}`);
    await client.end();
    process.exit(1);
  }

  // Bucket + policy report.
  const buckets = await client.query(
    "select id, public, file_size_limit from storage.buckets where id in ('avatars','documents') order by id"
  );
  console.log('\nBuckets:');
  for (const b of buckets.rows) {
    console.log(`  ${b.id.padEnd(10)} public=${b.public}  limit=${b.file_size_limit}`);
  }

  const policies = await client.query(
    "select policyname, cmd from pg_policies where schemaname='storage' and tablename='objects' and policyname like '%document%' order by cmd, policyname"
  );
  console.log(`\nstorage.objects policies for documents bucket (${policies.rows.length}):`);
  for (const p of policies.rows) console.log(`  [${p.cmd.padEnd(6)}] ${p.policyname}`);

  await client.end();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
