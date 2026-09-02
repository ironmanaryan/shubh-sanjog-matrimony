// Diagnose connectivity: DNS records + REST reachability for the Supabase project.
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;

const envPath = path.join(__dirname, '..', 'server', '.env');
const envText = fs.readFileSync(envPath, 'utf8');
const dbUrl = (envText.match(/^DATABASE_URL=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '') || '';
const supabaseUrl = (envText.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '') || '';
const serviceKey = (envText.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '') || '';

let dbHost = '';
try { dbHost = new URL(dbUrl).hostname; } catch {}

(async () => {
  console.log('Project REST URL:', supabaseUrl || '(none)');
  console.log('DB host:', dbHost || '(unparseable)');

  if (dbHost) {
    try {
      const a = await dns.resolve4(dbHost);
      console.log('A (IPv4) records:', a.join(', '));
    } catch (e) {
      console.log('A (IPv4) records: NONE —', e.code);
    }
    try {
      const aaaa = await dns.resolve6(dbHost);
      console.log('AAAA (IPv6) records:', aaaa.join(', '));
    } catch (e) {
      console.log('AAAA (IPv6) records: NONE —', e.code);
    }
  }

  // REST reachability — proves the project itself is up (or paused)
  if (supabaseUrl && serviceKey) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/notifications?select=id&limit=1`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      console.log('REST /notifications status:', res.status, res.ok ? '(project reachable ✓)' : '');
      if (res.ok) {
        const rows = await res.json();
        console.log('notifications rows visible via REST:', Array.isArray(rows) ? rows.length : '(unexpected shape)');
      } else {
        const text = await res.text();
        console.log('REST error body:', text.slice(0, 200));
      }
    } catch (e) {
      console.log('REST fetch failed:', e.message);
    }
  } else {
    console.log('REST check skipped (missing URL or service key)');
  }
})();
