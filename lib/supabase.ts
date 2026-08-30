// Supabase client — pure 6-digit Email OTP without runtime warnings.
// Directly uses NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY with fallbacks.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://banrojskoitemzwosvfm.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_MbbhZXowsxLRSwfyPgxiQw_9HwQJWjD';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;
  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return _client;
}

export const supabase = getSupabase();

// ─── Email OTP helpers (6-digit, auto-create) ───────────────────────────────
// Wraps supabase.auth.signInWithOtp / verifyOtp with type 'email' per task.
export async function sendEmailOtp(email: string) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase not configured');
  return client.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      shouldCreateUser: true,
    },
  });
}

export async function verifyEmailOtp(email: string, token: string) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase not configured');
  return client.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  });
}

// Helper for server-side token verification (no throw).
export async function getSupabaseUser(accessToken: string) {
  const client = getSupabase();
  if (!client || !accessToken) return null;
  try {
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}
