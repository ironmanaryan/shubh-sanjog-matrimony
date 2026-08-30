'use client';

// Email OTP Auth — 6-digit OTP via Supabase Auth (primary) with Express fallback.
// Implements per task:
//   send: supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
//   verify: supabase.auth.verifyOtp({ email, token, type: 'email' })
// Auto-creates users on sign-in. Falls back to /api/auth/* when Supabase
// unconfigured so local dev / SQLite preview never breaks.

import { getSupabase, sendEmailOtp, verifyEmailOtp } from './supabase';

export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const TOKEN_KEY = 'token';
const USER_KEY = 'shubhSanjogUser';

const AUTH_TIMEOUT_MS = 8000;
const UNREACHABLE_ERROR =
  'Cannot reach the authentication service. Please check your connection and try again.';

/** Universal dev master code — mirrors process.env.DEV_MASTER_OTP on the API. */
const DEV_MASTER_OTP = process.env.DEV_MASTER_OTP || '123456';

/** Mirrors server/middleware/rbac.js DEFAULT_ADMIN_IDENTIFIERS (+contains rule). */
const DEFAULT_ADMIN_IDENTIFIERS = ['admin@shubhsanjog.com', 'aryansadanshiv8@gmail.com'];

function resolvePreviewRole(identifier: string): string {
  const value = identifier.trim().toLowerCase();
  if (value.includes('admin') || DEFAULT_ADMIN_IDENTIFIERS.includes(value)) return 'admin';
  return 'customer';
}

/** Local preview mode exists ONLY outside production builds. */
function offlinePreviewAvailable(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export type SessionUser = {
  id: string;
  identifier: string;
  role: string;
  fullName?: string;
};

export type OtpSendResult = {
  ok: boolean;
  /** Shown ONLY when the server explicitly returns it (dev, no provider). */
  demoOtp?: string;
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

// Loose shape check used to validate the OPTIONAL email field — never used to
// require one. Phone-only sign-in/registration is fully supported.
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function sendOtp(identifier: string): Promise<OtpSendResult> {
  const trimmed = identifier.trim();
  const isEmail = looksLikeEmail(trimmed);

  // 1) Supabase 6-digit Email OTP (primary) — auto-create user
  if (isEmail) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await sendEmailOtp(trimmed);
        if (!error) return { ok: true, provider: 'supabase' };
        // Supabase rate-limit or invalid email → surface clean message but still fallback
        if (error.message?.toLowerCase().includes('rate')) {
          return { ok: false, error: 'Too many requests. Please wait a minute and try again.' };
        }
        console.warn('[auth] Supabase Email OTP failed, falling back to API:', error.message);
      } catch (e) {
        console.warn('[auth] Supabase Email OTP exception, falling back:', e);
      }
    }
  }

  // 2) Fallback: Express API (supports phone + email OTP via legacy provider)
  const posted = await fetchJsonWithFallback('/auth/send-otp', { identifier: trimmed });

  if (!posted.reachable) {
    if (!offlinePreviewAvailable()) return { ok: false, error: UNREACHABLE_ERROR };
    console.warn('[auth] API unreachable — using local preview (dev master code).');
    return { ok: true, demoOtp: DEV_MASTER_OTP, provider: 'dev-preview' };
  }

  const json = await posted.res.json().catch(() => ({}));
  if (!posted.res.ok) return { ok: false, error: json.error || 'Could not send OTP' };
  return { ok: true, demoOtp: json.demoOtp, provider: json.provider };
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

  // 1) Supabase 6-digit Email OTP verification (type: 'email')
  if (isEmail) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await verifyEmailOtp(identifier, trimmedCode);
        if (!error && data?.session?.access_token && data?.user) {
          const role = resolvePreviewRole(identifier);
          const user: SessionUser = {
            id: data.user.id,
            identifier: identifier.trim().toLowerCase(),
            role: (data.user.app_metadata?.role as string) || (data.user.user_metadata?.role as string) || role,
            fullName: (data.user.user_metadata?.full_name as string) || details.fullName,
          };
          persistSession(data.session.access_token, user);
          return { ok: true, role: user.role };
        }
        if (error) {
          const msg = error.message?.toLowerCase() || '';
          if (msg.includes('expired') || msg.includes('invalid')) {
            return { ok: false, error: 'Invalid or expired OTP. Please request a new code.' };
          }
          console.warn('[auth] Supabase verifyOtp failed, falling back:', error.message);
        }
      } catch (e) {
        console.warn('[auth] Supabase verifyOtp exception, falling back:', e);
      }
    }
  }

  const posted = await fetchJsonWithFallback('/auth/verify-otp', { identifier, code, ...details });

  // Backend unreachable — degrade to local preview auth in dev builds.
  if (!posted.reachable) {
    if (!offlinePreviewAvailable()) return { ok: false, error: UNREACHABLE_ERROR };
    if (String(code).trim() !== DEV_MASTER_OTP) return { ok: false, error: 'Invalid OTP' };

    const role = resolvePreviewRole(identifier);
    const user: SessionUser = {
      id: `preview:${identifier}`,
      identifier,
      role,
      ...(details.fullName ? { fullName: details.fullName } : {}),
    };
    // Clearly-marked pseudo-token: the real API will reject it with 401 once
    // it returns, at which point normal auth errors resume.
    persistSession(`preview.${btoa(unescape(encodeURIComponent(JSON.stringify(user))))}`, user);
    console.warn('[auth] API unreachable — signed in with a LOCAL PREVIEW session.');
    return { ok: true, role };
  }

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
