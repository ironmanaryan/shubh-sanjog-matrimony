// E2E test of the realtime notification system — Part 1: DB state inspection.
// Lists users + recent notifications so we can pick a real user to test with.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envText = fs.readFileSync(path.join(__dirname, '..', 'server', '.env'), 'utf8');
function envValue(name) {
  const re = new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`, 'm');
  return (envText.match(re) || [])[1]?.trim().replace(/^["']|["']$/g, '') || '';
}
const parsed = new URL(envValue('DATABASE_URL'));
const projectRef = parsed.hostname.replace(/^db\./, '').replace(/\.supabase\.co$/, '');
const cs = `postgresql://postgres.${projectRef}:${encodeURIComponent(decodeURIComponent(parsed.password))}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`;

(async () => {
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const users = await c.query(
    `select id, identifier, email, role, created_at from users order by created_at desc limit 8`
  );
  console.log('=== users (latest 8) ===');
  for (const u of users.rows) {
    console.log(`  ${u.id} | ${u.identifier} | ${u.email || '-'} | role=${u.role || 'customer'}`);
  }

  const notes = await c.query(
    `select id, to_user_id, type, at, read_at from notifications order by at desc limit 8`
  );
  console.log('\n=== recent notifications (latest 8) ===');
  for (const n of notes.rows) {
    console.log(
      `  ${n.id} | to=${n.to_user_id} | ${n.type} | ${new Date(Number(n.at)).toISOString()} | ${n.read_at ? 'read' : 'unread'}`
    );
  }

  await c.end();
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
