'use client';

// Shared client-side auth helpers for the OTP flow.
//
// Production contract (PRD §2): every session is issued by the real API after
// server-side OTP verification. There is NO offline/demo login — if the API is
// unreachable the UI says so instead of minting a fake session. The only
// convenience remaining is the server-controlled `demoOtp`: the API includes it
// in its response ONLY outside production when no SMS/email provider is
// configured, so developers can still sign in locally.

export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const TOKEN_KEY = 'token';
const USER_KEY = 'shubhSanjogUser';

export type SessionUser = {
  id: string;
  identifier: string;
  role: string;
  fullName?: string;
};

export type OtpSendResult = {
  ok: boolean;
  /** Shown ONLY when the server explicitly returns it (dev, no provider configured). */
  demoOtp?: string;
  provider?: string;
  error?: string;
};

export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError; // fetch() throws TypeError on network failure
}

const AUTH_TIMEOUT_MS = 8000;

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
  try {
    const res = await postJsonWithTimeout('/auth/send-otp', { identifier });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error || 'Could not send OTP' };
    // demoOtp is only ever present when the SERVER decides (dev + no provider).
    return { ok: true, demoOtp: json.demoOtp, provider: json.provider };
  } catch (err) {
    if (isNetworkError(err)) {
      return { ok: false, error: 'Cannot reach the authentication service. Please check your connection and try again.' };
    }
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

export async function verifyOtp(
  identifier: string,
  code: string,
  details: VerifyOtpDetails = {}
): Promise<VerifyResult> {
  try {
    const res = await postJsonWithTimeout('/auth/verify-otp', { identifier, code, ...details });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.token) return { ok: false, error: json.error || 'Invalid OTP' };

    const user = json.user || { id: identifier, identifier, role: 'customer' };
    persistSession(json.token, user);
    return { ok: true, role: user.role || 'customer' };
  } catch (err) {
    if (isNetworkError(err)) {
      return { ok: false, error: 'Cannot reach the authentication service. Please check your connection and try again.' };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Login failed' };
  }
}
