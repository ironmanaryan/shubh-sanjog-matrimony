// Definitive check: has realtime_notifications.sql been applied?
// Strategy:
//   1. REST (anon key) — indirect RLS signal
//   2. Direct Postgres via the IPv4 pooler (db.<ref>.supabase.co is IPv6-only
//      and unreachable from this machine) — region is auto-detected by DNS.
// Credentials are read from server/.env and never printed.
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');
const { Client } = require('pg');

const envText = fs.readFileSync(path.join(__dirname, '..', 'server', '.env'), 'utf8');
function envValue(name) {
  const re = new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`, 'm');
  return (envText.match(re) || [])[1]?.trim().replace(/^["']|["']$/g, '') || '';
}

const supabaseUrl = envValue('NEXT_PUBLIC_SUPABASE_URL') || envValue('SUPABASE_URL');
const anonKey = envValue('NEXT_PUBLIC_SUPABASE_ANON_KEY') || envValue('SUPABASE_ANON_KEY');
const dbUrl = envValue('DATABASE_URL');

const parsed = new URL(dbUrl);
const dbPassword = decodeURIComponent(parsed.password);
const projectRef = parsed.hostname.replace(/^db\./, '').replace(/\.supabase\.co$/, '');
const poolerUser = `postgres.${projectRef}`;

const REGIONS = [
  'ap-south-1', 'ap-southeast-1', 'us-east-1', 'us-east-2', 'eu-west-1',
  'ap-northeast-1', 'eu-central-1', 'us-west-1', 'ap-southeast-2',
  'eu-west-2', 'eu-west-3', 'ca-central-1', 'sa-east-1', 'ap-east-1',
  'ap-south-2', 'eu-north-1', 'me-central-1',
];

async function findPoolerRegion() {
  for (const region of REGIONS) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    try {
      const addrs = await dns.resolve4(host);
      if (addrs.length) return region;
    } catch { /* try next */ }
  }
  return null;
}

function tryConnect(host, user, password, port = 5432, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const fail = (err) => { socket.destroy(); reject(err); };
    socket.setTimeout(timeoutMs, () => fail(new Error('tcp timeout')));
    socket.once('connect', () => { socket.destroy(); resolve(host); });
    socket.once('error', fail);
  });
}

async function runCatalogChecks(connectionString, userForLog) {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const pub = await c.query(
    `select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'`
  );
  console.log('1. Realtime publication:', pub.rowCount > 0 ? 'ENABLED ✓' : 'NOT ENABLED ✗');

  const rls = await c.query(`select relrowsecurity from pg_class where relname = 'notifications'`);
  console.log('2. RLS on notifications:', rls.rows[0]?.relrowsecurity ? 'ENABLED ✓' : 'DISABLED ✗');

  const pol = await c.query(`select count(*)::int as n from pg_policies where tablename = 'notifications'`);
  console.log('3. RLS policies:', pol.rows[0].n > 0 ? `${pol.rows[0].n} policies ✓` : 'NONE ✗');

  let jobs;
  try {
    jobs = await c.query(`select jobname, schedule from cron.job order by jobname`);
    console.log('4. pg_cron jobs:', jobs.rows.length ? jobs.rows.map((j) => `${j.jobname} (${j.schedule})`).join(', ') : 'NONE ✗');
  } catch (e) {
    console.log('4. pg_cron jobs: extension missing ✗ —', e.message.slice(0, 80));
  }

  const fn = await c.query(
    `select proname from pg_proc where proname in
     ('fn_send_appointment_reminders','fn_send_membership_expiry_reminders','notification_now_ms')`
  );
  console.log('5. Cron functions:', fn.rows.map((f) => f.proname).join(', ') || 'NONE ✗');

  const rows = await c.query(`select count(*)::int as n from notifications`);
  console.log('6. notifications rows:', rows.rows[0].n);

  // 7. Full RLS audit of public schema — any table with RLS but zero policies
  //    is completely opaque to browser clients (and blocks sub-selects in
  //    other tables' policies, e.g. notifications -> users).
  const audit = await c.query(`
    select c.relname as tablename, c.relrowsecurity as rls,
           (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  `);
  console.log('7. Public tables RLS audit:');
  for (const r of audit.rows) {
    const flag = !r.rls ? 'RLS off (anon-full-access risk if grants exist)' : r.policies > 0 ? 'OK ✓' : 'RLS ON + 0 POLICIES ⚠ BLOCKED';
    console.log(`   - ${r.tablename}: rls=${r.rls ? 'on' : 'off'}, policies=${r.policies} → ${flag}`);
  }

  await c.end();
  console.log(`\nConnected via pooler as ${userForLog}`);
}

(async () => {
  console.log(`Project: ${projectRef}`);
  console.log(`REST URL: ${supabaseUrl.replace(/\/\/[^.]+/, '//<ref>') || '(missing)'}`);

  // ── 1. Indirect REST signal (anon key + RLS) ────────────────────────────
  if (supabaseUrl && anonKey) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/notifications?select=id&limit=5`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });
      if (res.status === 200) {
        const body = await res.json();
        const n = Array.isArray(body) ? body.length : -1;
        console.log(`REST anon select: 200, ${n} rows ${n > 0 ? '→ RLS OFF ✗ (anon can read!)' : '→ RLS likely ON ✓ or table empty'}`);
      } else {
        console.log(`REST anon select: HTTP ${res.status} (RLS/grant signal)`);
      }
    } catch (e) {
      console.log('REST check failed:', e.message);
    }
  }

  // ── 2. Definitive: direct Postgres over the IPv4 pooler ──────────────────
  const region = await findPoolerRegion();
  if (!region) {
    console.log('\nNo reachable pooler region — cannot check database directly.');
    return;
  }
  const poolerHost = `aws-0-${region}.pooler.supabase.com`;
  console.log(`\nTrying pooler: ${poolerHost} (session, port 5432)...`);
  try {
    await tryConnect(poolerHost, poolerUser, dbPassword);
  } catch (e) {
    console.log('Pooler TCP unreachable:', e.message);
    return;
  }

  const cs = `postgresql://${encodeURIComponent(poolerUser)}:${encodeURIComponent(dbPassword)}@${poolerHost}:5432/postgres`;
  try {
    await runCatalogChecks(cs, poolerUser);
  } catch (e) {
    console.error('Catalog check failed:', e.message.slice(0, 200));
    process.exitCode = 1;
  }
})();
