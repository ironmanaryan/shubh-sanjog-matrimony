/**
 * Admin session storage.
 *
 * The admin panel authenticates against the `admin_users` table via its own
 * JWT (`/api/admin/login`), separate from the customer Supabase session. Both
 * systems share `localStorage.token`, which is what every `/api/*` call sends
 * as `Authorization: Bearer …`, so an admin JWT is accepted anywhere the
 * platform JWT is.
 *
 * Everything that reads or writes an admin session goes through this module so
 * the storage shape can never drift between the login page, the inline sign-in
 * gate, the dashboard and the security settings page.
 */

const TOKEN_KEY = 'token';
const USER_KEY = 'shubhSanjogUser';

export type AdminIdentity = {
  id: string;
  username: string;
  email: string;
};

export function persistAdminSession(token: string, admin: AdminIdentity): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(
      USER_KEY,
      JSON.stringify({
        id: admin.id,
        identifier: admin.email || admin.username,
        role: 'admin',
        fullName: admin.username,
      })
    );
  } catch {
    /* storage unavailable (private mode) — non-fatal, the caller will re-prompt */
  }
}

/** Replaces only the token, e.g. after an update re-issues it with new claims. */
export function updateAdminToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* non-fatal */
  }
}

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearAdminSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* non-fatal */
  }
}

/** Authorization header for admin-scoped fetch calls. */
export function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** True when a token exists AND the cached identity says it belongs to an admin. */
export function hasAdminSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (!localStorage.getItem(TOKEN_KEY)) return false;
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return false;
    const user = JSON.parse(raw) as { role?: string };
    return user.role === 'admin';
  } catch {
    return false;
  }
}
