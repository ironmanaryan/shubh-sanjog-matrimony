'use client';

// Google OAuth entry point shared by /login and /register.
//
// The post-login destination cannot simply be appended to `redirectTo`:
// Supabase matches redirect URLs against an allow-list, so
// `/auth/callback?next=/plans` only works when that exact URL is registered in
// the dashboard. A short-lived cookie survives the OAuth round trip without
// requiring any extra allow-list entry, and `app/auth/callback/route.ts` reads
// it back (`shubh_sanjog_next`) after the session is established.

import { getSupabase } from './supabase';

/** Cookie used to carry `?next=` through the Google OAuth round trip. */
export const NEXT_COOKIE = 'shubh_sanjog_next';

/** Only same-site absolute paths may be used as a post-login destination. */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.startsWith('/auth/') || value.startsWith('/login') || value.startsWith('/register')) {
    return null;
  }
  return value;
}

export function rememberNextPath(next: string | null | undefined) {
  if (typeof document === 'undefined') return;
  const safe = safeNextPath(next);
  if (!safe) return;
  // 10 minutes is plenty for a Google consent screen.
  document.cookie = `${NEXT_COOKIE}=${encodeURIComponent(safe)}; path=/; max-age=600; samesite=lax`;
}

export function clearNextPath() {
  if (typeof document === 'undefined') return;
  document.cookie = `${NEXT_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export type GoogleSignInResult = { ok: boolean; error?: string };

/**
 * Kick off the Google OAuth flow.
 *
 * Resolves with `{ ok: true }` only when the browser is actually navigating
 * away; on failure it resolves with a human-readable `error` so the caller can
 * render it instead of leaving the user on a dead button.
 */
export async function signInWithGoogle(nextPath?: string | null): Promise<GoogleSignInResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      ok: false,
      error:
        'Sign-in is not configured on this deployment. NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.',
    };
  }

  if (typeof window === 'undefined') return { ok: false, error: 'Please retry from a browser.' };

  // Persist the destination BEFORE leaving the page — the callback reads it
  // after the provider redirects back.
  rememberNextPath(nextPath);

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // No `queryParams` on purpose: an earlier build passed
      // `prompt: select_account` here and it broke the flow on iOS Safari.
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) return { ok: false, error: error.message || 'Google sign-in failed.' };
    if (!data?.url) return { ok: false, error: 'Google sign-in did not return a redirect URL.' };

    window.location.assign(data.url);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Google sign-in failed.' };
  }
}
