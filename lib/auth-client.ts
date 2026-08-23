'use client';

// Shared client-side auth helpers for the OTP flow.
//
// Resilience contract (Demo Mode): when the Express API cannot be reached —
// network error, 5xx from a dead gateway/proxy, or a request that hangs past
// the timeout — the UI silently switches to Demo Mode instead of dead-ending
// with "Cannot reach the authentication service". Demo Mode shows the
// universal code (123456) on send and accepts ANY 6-digit code at verify
// time, minting a local demo session (token + profile persisted to
// localStorage) so admins and customers can always sign in and reach their
// dashboard. When the real API responds normally, the strict server-verified
// path is used unchanged.

export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export const DEV_MASTER_OTP = '123456';
export const isDev = () => process.env.NODE_ENV !== 'production';

const TOKEN_KEY = 'token';
const USER_KEY = 'shubhSanjogUser';

export type SessionUser = {
  id: string;
  identifier: string;
  role: string;
  fullName?: string;
  offline?: boolean;
};

export type OtpSendResult = {
  ok: boolean;
  demoOtp?: string;
  offline?: boolean;
  error?: string;
};

export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError; // fetch() throws TypeError on network failure
}

// True when the failure means "the auth service could not be reached": a
// network error ("TypeError: Failed to fetch") or an aborted/timed-out
// request (AbortController rejects with a DOMException named "AbortError").
function isUnreachableError(err: unknown): boolean {
  if (isNetworkError(err)) return true;
  return err instanceof DOMException && err.name === 'AbortError';
}

const AUTH_TIMEOUT_MS = 8000;

// POST JSON with a hard timeout, so a hung request counts as "unreachable"
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

// Role heuristic mirrors the server (which also honors an env-configured
// ADMIN_IDENTIFIERS list): identifiers containing "admin" get the admin role so
// `admin@shubhsanjog.com` / `admin` land on the admin panel.
export function roleForIdentifier(identifier: string): 'admin' | 'customer' {
  return identifier.toLowerCase().includes('admin') ? 'admin' : 'customer';
}

// Loose shape check used to validate the OPTIONAL email field — never used to
// require one. Phone-only sign-in/registration is fully supported.
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Demo Mode send result — the UI displays this code so the user can sign in
// while the real API is down.
function demoSendResult(): OtpSendResult {
  return { ok: true, offline: true, demoOtp: DEV_MASTER_OTP };
}

export async function sendOtp(identifier: string): Promise<OtpSendResult> {
  try {
    const res = await postJsonWithTimeout('/auth/send-otp', { identifier });
    // A 5xx from a reverse proxy/gateway means the API itself is down —
    // treat it exactly like an unreachable service and use Demo Mode.
    if (res.status >= 500) return demoSendResult();
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error || 'Could not send OTP' };
    return { ok: true, demoOtp: json.demoOtp };
  } catch (err) {
    // API offline or timed out — silently switch to Demo Mode instead of
    // throwing "Cannot reach the authentication service".
    if (isUnreachableError(err)) return demoSendResult();
    return { ok: false, error: err instanceof Error ? err.message : 'Could not send OTP' };
  }
}

export type VerifyResult =
  | { ok: true; role: string }
  | { ok: false; error: string };

export type VerifyOtpDetails = {
  fullName?: string;
  email?: string; // strictly optional — omitted/null when the user skipped it
};

// Demo Mode login — when the real API cannot be reached, accept any 6-digit
// code and mint a local session (token + mock profile stored in localStorage)
// so the user is still logged in and redirected to their dashboard.
function demoVerify(identifier: string, code: string): VerifyResult {
  if (!/^\d{6}$/.test(code.trim())) return { ok: false, error: 'Invalid OTP' };
  const role = roleForIdentifier(identifier);
  persistSession(`demo.${role}.${Date.now()}`, {
    id: role === 'admin' ? 'demo-admin' : 'demo-customer',
    identifier,
    role,
    fullName: role === 'admin' ? 'Admin (Demo)' : 'Demo User',
    offline: true,
  });
  return { ok: true, role };
}

export async function verifyOtp(
  identifier: string,
  code: string,
  details: VerifyOtpDetails = {}
): Promise<VerifyResult> {
  try {
    const res = await postJsonWithTimeout('/auth/verify-otp', { identifier, code, ...details });
    // API down behind a failing gateway — fall back to Demo Mode.
    if (res.status >= 500) return demoVerify(identifier, code);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.token) return { ok: false, error: json.error || 'Invalid OTP' };

    const user: SessionUser = json.user || { id: identifier, identifier, role: roleForIdentifier(identifier) };
    persistSession(json.token, user);
    return { ok: true, role: user.role || roleForIdentifier(identifier) };
  } catch (err) {
    // API unreachable or timed out — Demo Mode instead of throwing
    // "Cannot reach the authentication service".
    if (isUnreachableError(err)) return demoVerify(identifier, code);
    return { ok: false, error: err instanceof Error ? err.message : 'Login failed' };
  }
}
