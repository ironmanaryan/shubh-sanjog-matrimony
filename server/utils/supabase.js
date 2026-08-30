// Server-side Supabase client — Express API
// Uses .env / .env.local vars:
//   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY
// Falls back to null when not configured so local SQLite preview keeps working.
const { createClient } = require('@supabase/supabase-js');

const url =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';

const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

let _client = null;

function getSupabaseAdmin() {
  if (!url || !serviceKey) return null;
  if (_client) return _client;
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
