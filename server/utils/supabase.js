// Server-side Supabase client — Express API
// Explicitly uses NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)
// Logs detailed error at runtime if missing instead of silent fallback.
const { createClient } = require('@supabase/supabase-js');

function stripQuotes(v) {
  if (!v) return '';
  const t = String(v).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1).trim();
  return t;
}

const url = stripQuotes(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '');

const serviceKey = stripQuotes(
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
);

let _client = null;

function getSupabaseAdmin() {
  const isPlaceholderKey = serviceKey.includes('...') || serviceKey.length < 20 || serviceKey === 'YOUR_SUPABASE_ANON_KEY';
  const isInvalidUrl = !url || !url.startsWith('https://') || url.includes('...');
  if (!url || !serviceKey || isPlaceholderKey || isInvalidUrl) {
    console.error('[supabase:server] Cannot initialize — Supabase env vars missing/invalid', {
      url: !url ? 'MISSING' : isInvalidUrl ? `INVALID (${url})` : `SET (${url.slice(0, 30)}…)`,
      serviceKey: !serviceKey
        ? 'MISSING'
        : isPlaceholderKey
          ? `PLACEHOLDER (length ${serviceKey.length}) — set SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY`
          : `SET (length ${serviceKey.length})`,
      hint: 'Set SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env and restart.',
    });
    return null;
  }
  if (_client) return _client;
  // Explicitly pass URL and key to createClient
  _client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}

async function verifySupabaseToken(token) {
  const client = getSupabaseAdmin();
  if (!client || !token) return null;
  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

module.exports = { getSupabaseAdmin, verifySupabaseToken };
