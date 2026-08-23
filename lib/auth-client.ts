'use client';

// Shared client-side auth helpers for the OTP flow.
//
// Resilience contract (dev/demo): when the Express API is unreachable, the UI
// must never dead-end. In non-production builds a universal master OTP
// (123456) unlocks a local session so admins and customers can always sign in.
// Production builds keep the strict server-verified path only.

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

// Role heuristic mirrors the server: identifiers containing "admin" get the
// admin role so `admin@shubhsanjog.com` / `admin` land on the admin panel.
export function roleForIdentifier(identifier: string): 'admin' | 'customer' {
  return identifier.toLowerCase().includes('admin') ? 'admin' : 'customer';
}

export async function sendOtp(identifier: string): Promise<OtpSendResult> {
  try {
    const res = await fetch(`${API}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error || 'Could not send OTP' };
    return { ok: true, demoOtp: json.demoOtp };
  } catch (err) {
    // API offline — fall back to the dev master code instead of dead-ending.
    if (isNetworkError(err)) {
      if (isDev()) return { ok: true, offline: true, demoOtp: DEV_MASTER_OTP };
      return { ok: false, error: 'Cannot reach the authentication service. Please try again later.' };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Could not send OTP' };
  }
}

export type VerifyResult =
  | { ok: true; role: string }
  | { ok: false; error: string };

export async function verifyOtp(identifier: string, code: string): Promise<VerifyResult> {
  try {
    const res = await fetch(`${API}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, code }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.token) return { ok: false, error: json.error || 'Invalid OTP' };

    const user: SessionUser = json.user || { id: identifier, identifier, role: roleForIdentifier(identifier) };
    persistSession(json.token, user);
    return { ok: true, role: user.role || roleForIdentifier(identifier) };
  } catch (err) {
    // API offline — in development allow the master OTP to open a local session.
    if (isNetworkError(err) && isDev() && code === DEV_MASTER_OTP) {
      const role = roleForIdentifier(identifier);
      persistSession(`offline.${role}.${Date.now()}`, {
        id: `offline-${role}`,
        identifier,
        role,
        offline: true,
      });
      return { ok: true, role };
    }
    if (isNetworkError(err)) {
      return { ok: false, error: 'Cannot reach the authentication service. Please try again later.' };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Login failed' };
  }
}
