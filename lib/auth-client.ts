'use client';

// Email OTP Auth — 6-digit OTP via Supabase Auth (primary) with Express fallback.
// Implements per task:
//   send: supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
//   verify: supabase.auth.verifyOtp({ email, token, type: 'email' })
// Auto-creates users on sign-in. Falls back to /api/auth/* when Supabase
// unconfigured so local dev / SQLite preview never breaks.

import { getSupabase, sendEmailOtp, verifyEmailOtp } from './supabase';
import { API } from './api-base';
import { clearApiSession, exchangeSupabaseSession } from './session-bridge';

export { API };

const TOKEN_KEY = 'token';
const USER_KEY = 'shubhSanjogUser';

/**
 * Where Supabase sends the user when they click the link in an OTP email.
 *
 * Deliberately NOT /auth/callback: that is a serverless route handler for the
 * PKCE `?code=` exchange Google uses, and a URL fragment never reaches the
 * server. Magic-link sessions arrive as `#access_token=…`, so they need
 * /auth/complete — a client page that can read the fragment.
 */
const EMAIL_REDIRECT_PATH = '/auth/complete';

const AUTH_TIMEOUT_MS = 8000;
const UNREACHABLE_ERROR =
  'Cannot reach the authentication service. Please check your connection and try again.';

/**
 * Identifiers granted admin on the client for UI gating only.
 *
 * EXACT MATCH ONLY. A previous version also matched any identifier *containing*
 * "admin", which meant `admin-attacker@evil.com` or `notadmin@x.com` were
 * treated as administrators. Real authorization is always enforced server-side
 * by server/middleware/rbac.js — this list only decides which UI to show.
 */
const DEFAULT_ADMIN_IDENTIFIERS = ['admin@shubhsanjog.com', 'aryansadanshiv8@gmail.com'];

function resolvePreviewRole(identifier: string): string {
  const value = identifier.trim().toLowerCase();
  return DEFAULT_ADMIN_IDENTIFIERS.includes(value) ? 'admin' : 'customer';
}

export type SessionUser = {
  id: string;
  identifier: string;
  role: string;
  fullName?: string;
};

export type OtpSendResult = {
  ok: boolean;
  provider?: string;
  error?: string;
};

export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError; // fetch() throws TypeError on network failure
}

function isAbortError(err: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') ||
    (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError')
  );
}

// POST JSON with a hard timeout, so a hung request surfaces a clear error
// instead of leaving the user stuck on a spinner forever.
async function postJsonWithTimeout(path: string, body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    return await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST JSON with graceful network handling. Never throws for connectivity
 * problems — callers receive either a real `Response` or `{ reachable: false }`
 * and can decide how to degrade (offline preview vs. hard error). Unexpected
 * non-network failures are re-thrown so bugs stay visible.
 */
export async function fetchJsonWithFallback(
  path: string,
  body: unknown
): Promise<{ reachable: true; res: Response } | { reachable: false }> {
  try {
    return { reachable: true, res: await postJsonWithTimeout(path, body) };
  } catch (err) {
    if (isNetworkError(err) || isAbortError(err)) return { reachable: false };
    throw err;
  }
}

function persistSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getSession(): { token: string | null; user: SessionUser | null } {
  if (typeof window === 'undefined') return { token: null, user: null };
  const token = localStorage.getItem(TOKEN_KEY);
  try {
    const raw = localStorage.getItem(USER_KEY);
    return { token, user: raw ? (JSON.parse(raw) as SessionUser) : null };
  } catch {
    return { token, user: null };
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * Sign out of *both* auth systems.
 *
 * Clearing localStorage alone is what left people "still logged in": the
 * Supabase cookie session survived, so the middleware kept serving /customer
 * and the next page load silently re-minted an API token. The Supabase sign-out
 * has to happen first so the cookie is actually revoked.
 */
export async function signOut(): Promise<void> {
  try {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
  } catch {
    /* network hiccup — local cleanup below still runs */
  }
  clearSession();
  clearApiSession();
  try {
    localStorage.removeItem('shubhSanjogProfile');
    localStorage.removeItem('shubhSanjogProfileCompleted');
  } catch {
    /* storage unavailable — non-fatal */
  }
}

// Loose shape check used to validate the OPTIONAL email field — never used to
// require one. Phone-only sign-in/registration is fully supported.
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function sendOtp(identifier: string): Promise<OtpSendResult> {
  const trimmed = identifier.trim();
  const isEmail = looksLikeEmail(trimmed);

  // Pure Supabase Email OTP — real authentication only
  if (isEmail) {
    const supabase = getSupabase();
    if (!supabase) {
      console.error('[supabase] Cannot reach the authentication service — Supabase client not initialized. Check NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
      return { ok: false, error: UNREACHABLE_ERROR };
    }
    try {
      const { data, error } = await supabase.auth.signInWithOtp({
        email: trimmed.toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}${EMAIL_REDIRECT_PATH}`,
        },
      });
      console.error('[supabase] signInWithOtp raw error object:', error);
      console.log('[supabase] signInWithOtp raw response:', { data, error });
      if (error) {
        console.error('[supabase] signInWithOtp error JSON:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        return { ok: false, error: error.message || 'Could not send OTP. Please try again.' };
      }
      console.log('[supabase] signInWithOtp success — OTP sent to', trimmed);
      return { ok: true, provider: 'supabase' };
    } catch (e) {
      console.error('[supabase] signInWithOtp exception raw:', e);
      const msg = e instanceof Error ? e.message : 'Could not send OTP';
      return { ok: false, error: msg };
    }
  }

  // Non-email (phone) still uses Express API — no fake dev code
  const posted = await fetchJsonWithFallback('/auth/send-otp', { identifier: trimmed });
  if (!posted.reachable) return { ok: false, error: UNREACHABLE_ERROR };
  const json = await posted.res.json().catch(() => ({}));
  if (!posted.res.ok) return { ok: false, error: json.error || 'Could not send OTP' };
  return { ok: true, provider: json.provider };
}

export type VerifyResult =
  | { ok: true; role: string }
  | { ok: false; error: string };

export type VerifyOtpDetails = {
  fullName?: string;
  email?: string; // strictly optional — omitted/null when the user skipped it
};

export async function verifyOtp(
  identifier: string,
  code: string,
  details: VerifyOtpDetails = {}
): Promise<VerifyResult> {
  const trimmedCode = code.trim();
  // Enforce 6-digit numeric OTP per task
  if (!/^\d{6}$/.test(trimmedCode)) {
    return { ok: false, error: 'Please enter a valid 6-digit OTP.' };
  }

  const isEmail = looksLikeEmail(identifier);

  // Pure Supabase Email OTP verification — real auth only
  if (isEmail) {
    const supabase = getSupabase();
    if (!supabase) {
      console.error('[supabase] Cannot reach the authentication service — Supabase client not initialized');
      return { ok: false, error: UNREACHABLE_ERROR };
    }
    try {
      const { data, error } = await verifyEmailOtp(identifier, trimmedCode);
      if (error) {
        console.error('[supabase] verifyOtp raw error:', error);
        console.error('[supabase] verifyOtp error JSON:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        return { ok: false, error: error.message || 'Invalid or expired OTP. Please request a new code.' };
      }
      if (data?.session?.access_token && data?.user) {
        console.log('[supabase] verifyOtp success — session established for', identifier);
        const role = resolvePreviewRole(identifier);
        const user: SessionUser = {
          id: data.user.id,
          identifier: identifier.trim().toLowerCase(),
          role: (data.user.app_metadata?.role as string) || (data.user.user_metadata?.role as string) || role,
          fullName: (data.user.user_metadata?.full_name as string) || details.fullName,
        };

        // Store the Supabase token first so the session is usable even if the
        // exchange below fails (the API accepts Supabase tokens as a fallback).
        persistSession(data.session.access_token, user);

        // Trade it for the platform JWT, which is what every other endpoint
        // expects. `localStorage.token` is overwritten with the JWT on success.
        try {
          await exchangeSupabaseSession(true);
        } catch (e) {
          console.warn('[auth] session exchange failed; falling back to Supabase token', e);
        }

        return { ok: true, role: user.role };
      }
      return { ok: false, error: 'Invalid or expired OTP. Please request a new code.' };
    } catch (e) {
      console.error('[supabase] verifyOtp exception raw:', e);
      const msg = e instanceof Error ? e.message : 'Verification failed';
      return { ok: false, error: msg };
    }
  }

  const posted = await fetchJsonWithFallback('/auth/verify-otp', { identifier, code, ...details });
  if (!posted.reachable) return { ok: false, error: UNREACHABLE_ERROR };

  const json = await posted.res.json().catch(() => ({}));
  if (!posted.res.ok || !json.token) return { ok: false, error: json.error || 'Invalid OTP' };

  const user = json.user || { id: identifier, identifier, role: 'customer' };
  // Prefer Supabase token when server minted one, else JWT
  const sessionToken = json.supabaseToken || json.token;
  persistSession(sessionToken, user);
  // If server returned both, stash JWT for legacy endpoints that still expect it
  if (json.jwt && json.supabaseToken) {
    try { localStorage.setItem('jwt_fallback', json.jwt); } catch {}
  }
  return { ok: true, role: user.role || 'customer' };
}
