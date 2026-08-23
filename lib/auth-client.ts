'use client';

// Shared client-side auth helpers for the OTP flow.
//
// Production contract (PRD §2): every session is issued by the real API after
// server-side OTP verification. In PRODUCTION builds an unreachable API still
// blocks sign-in — the UI explains that the auth service cannot be reached.
//
// LOCAL PREVIEW FALLBACK (development only): when the Express API is offline
// during local development/preview, auth falls back cleanly to a local
// preview session instead of dead-ending the user:
//   - send-otp resolves with the universal dev master code (123456), exactly
//     like the server's own `demoOtp` convenience (see
//     server/controllers/authController.js).
//   - verify-otp accepts that master code and mints a clearly-marked local
//     session token; role mirrors the server rule (`matchesAdminIdentifier`
//     in server/middleware/rbac.js): identifiers containing "admin" or the
//     designated DEFAULT_ADMIN_IDENTIFIERS get the admin role.
//   - The token is NOT a JWT and will 401 against the real API once it comes
//     back — sessions then surface normal auth errors. No fake data is ever
//     minted in production.

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
  const posted = await fetchJsonWithFallback('/auth/send-otp', { identifier });

  // Backend unreachable — degrade to local preview auth in dev builds.
  if (!posted.reachable) {
    if (!offlinePreviewAvailable()) return { ok: false, error: UNREACHABLE_ERROR };
    console.warn(
      '[auth] API unreachable — using local preview authentication. Start the backend with `npm run dev` (or `npm run server`) for real OTP flows.'
    );
    return { ok: true, demoOtp: DEV_MASTER_OTP, provider: 'dev-preview' };
  }

  const json = await posted.res.json().catch(() => ({}));
  if (!posted.res.ok) return { ok: false, error: json.error || 'Could not send OTP' };
  // demoOtp is only ever present when the SERVER decides (dev + no provider).
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
  persistSession(json.token, user);
  return { ok: true, role: user.role || 'customer' };
}
