// Browser Supabase client.
//
// Uses @supabase/ssr's `createBrowserClient` so the session lives in COOKIES —
// the same store that `middleware.ts` and `app/auth/callback/route.ts` read.
//
// This is the fix for the "Google login succeeds but nothing works" bug. The
// previous implementation used `createClient` from @supabase/supabase-js, which
// persists the session to localStorage. The OAuth callback wrote the session to
// cookies (via the SSR server client) and the browser client read localStorage —
// two disconnected stores. Result: middleware saw a logged-in user and let them
// through, but every client-side `getSession()` came back empty, so no access
// token was ever available to the API.
//
// No credentials are hardcoded here. Missing env vars produce a null client and
// a clear console error rather than silently talking to a fixed project.
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;
let _warned = false;

function config() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

/**
 * Returns the shared browser client, or null when Supabase is not configured or
 * we are not running in a browser (SSR pass of a Client Component).
 */
export function getSupabase(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (_client) return _client;

  const { url, key } = config();
  if (!url || !key) {
    if (!_warned) {
      _warned = true;
      console.error(
        '[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set — authentication is unavailable.'
      );
    }
    return null;
  }

  _client = createBrowserClient(url, key);
  return _client;
}

/** True when Supabase credentials are present in the environment. */
export function isSupabaseConfigured(): boolean {
  const { url, key } = config();
  return Boolean(url && key);
}

// ─── Email OTP helpers (6-digit, auto-create) ───────────────────────────────
export async function sendEmailOtp(email: string, redirectTo?: string) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase not configured');
  return client.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      shouldCreateUser: true,
      ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
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

/** Server/browser helper for token verification (never throws). */
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
