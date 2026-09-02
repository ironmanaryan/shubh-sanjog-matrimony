// Applies supabase/realtime_notifications.sql to the production database.
// Statement-by-statement with $$-aware splitting so one failure never rolls
// back the rest. Credentials from server/.env via the IPv4 session pooler
// (db.<ref>.supabase.co is IPv6-only and unreachable from this machine).
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const sqlPath = path.join(__dirname, '..', 'supabase', 'realtime_notifications.sql');
const sqlText = fs.readFileSync(sqlPath, 'utf8');

// ── Split into statements, respecting $$ dollar-quoted bodies ────────────────
function splitStatements(text) {
  const statements = [];
  let current = [];
  let inDollar = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine;
    // strip full-line comments for statement detection but keep them out of SQL
    if (!inDollar && line.trim().startsWith('--')) continue;
    const dollarCount = (line.match(/\$\$/g) || []).length;
    const becomesDollar = dollarCount % 2 === 1;
    current.push(line);
    if (becomesDollar) inDollar = !inDollar;
    if (!inDollar && line.trim().endsWith(';')) {
      const stmt = current.join('\n').trim();
      if (stmt && stmt !== ';') statements.push(stmt);
      current = [];
    }
  }
  const tail = current.join('\n').trim();
  if (tail && tail !== ';') statements.push(tail);
  return statements;
}

const envText = fs.readFileSync(path.join(__dirname, '..', 'server', '.env'), 'utf8');
function envValue(name) {
  const re = new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`, 'm');
  return (envText.match(re) || [])[1]?.trim().replace(/^["']|["']$/g, '') || '';
}

const dbUrl = envValue('DATABASE_URL');
const parsed = new URL(dbUrl);
const dbPassword = decodeURIComponent(parsed.password);
const projectRef = parsed.hostname.replace(/^db\./, '').replace(/\.supabase\.co$/, '');
const poolerHost = `aws-0-ap-south-1.pooler.supabase.com`; // region verified reachable
const connectionString = `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@${poolerHost}:5432/postgres`;

(async () => {
  const statements = splitStatements(sqlText);
  console.log(`Loaded ${statements.length} statements from realtime_notifications.sql\n`);

  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await c.connect();

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const label = stmt.replace(/\s+/g, ' ').slice(0, 72);
    try {
      await c.query(stmt);
      ok += 1;
      console.log(`✓ [${i + 1}/${statements.length}] ${label}`);
    } catch (e) {
      // Idempotency: "already exists" is fine on re-run
      const msg = e.message || '';
      if (/already exists/i.test(msg)) {
        ok += 1;
        console.log(`⊘ [${i + 1}/${statements.length}] already exists — ${label}`);
      } else {
        failed += 1;
        console.error(`✗ [${i + 1}/${statements.length}] ${label}\n   → ${msg.slice(0, 220)}`);
      }
    }
  }

  await c.end();
  console.log(`\nDone: ${ok} succeeded, ${failed} failed.`);
  process.exitCode = failed > 0 ? 1 : 0;
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
