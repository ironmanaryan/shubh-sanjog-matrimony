'use client';

// Bridges the two halves of authentication.
//
// Supabase owns identity (Google OAuth, email OTP) and proves it with a short-
// lived access token. The Express API authorizes with its own JWT stored under
// localStorage['token'].
//
// This module converts one into the other. Without it a user who signed in with
// Google had a perfectly valid Supabase session — middleware happily routed them
// to /customer — but `localStorage.token` was empty, so every API request went
// out with no Authorization header and returned 401. The UI looked logged in
// while profile, matches, documents and payments were all silently broken.
//
// Ordering matters. React runs effects bottom-up, so a page's data-loading
// effect fires BEFORE the root <SessionBridge /> effect. That is why the
// exchange is kicked off eagerly at module-evaluation time and exposed through
// `ensureApiSession()`, which any caller can await.

import { getSupabase } from './supabase';
import { API } from './api-base';

const TOKEN_KEY = 'token';
const USER_KEY = 'shubhSanjogUser';

/** Dispatched on `window` whenever the API session changes. */
export const AUTH_READY_EVENT = 'shubh-sanjog:auth-ready';

/** Minimal decode of a JWT payload — no signature verification (server does that). */
function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json =
      typeof window !== 'undefined' && typeof window.atob === 'function'
        ? window.atob(base64)
        : Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(decodeURIComponent(escape(json))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * True when localStorage already holds one of OUR API JWTs.
 *
 * The `userId` claim distinguishes our tokens from Supabase access tokens, which
 * carry `sub` instead. That distinction matters: a stale Supabase token in this
 * slot would look valid but skip the exchange.
 */
export function hasUsableApiToken(): boolean {
  if (typeof window === 'undefined') return false;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return false;

  const payload = decodePayload(token);
  if (!payload || typeof payload.userId !== 'string' || !payload.userId) return false;

  // Treat a token as expired 60s early so we never race the server's check.
  const exp = typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  return exp === null || Date.now() < exp - 60_000;
}

let inflight: Promise<boolean> | null = null;

function announce() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_READY_EVENT));
}

/**
 * Exchange the current Supabase session for an API JWT and persist it.
 *
 * @param force exchange even if a usable token is already present (used after a
 *              sign-in or token refresh so role changes take effect immediately)
 */
export async function exchangeSupabaseSession(force = false): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (inflight) return inflight;
  if (!force && hasUsableApiToken()) return true;

  inflight = (async () => {
    try {
      const supabase = getSupabase();
      if (!supabase) return false;

      const { data } = await supabase.auth.getSession();
      const accessToken = data?.session?.access_token;
      if (!accessToken) return false;

      const res = await fetch(`${API}/auth/supabase-session`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        console.warn('[session-bridge] exchange failed:', res.status);
        // Persist a minimal identity straight from the Supabase session so the
        // UI still knows who is signed in. The API accepts the Supabase access
        // token directly (see server/middleware/auth.js), so nothing is broken
        // while the JWT exchange is unavailable.
        if (data.session) persistSupabaseIdentity(data.session);
        return false;
      }

      const json: { token?: string; user?: Record<string, unknown> } = await res
        .json()
        .catch(() => ({}));
      if (!json.token) return false;

      localStorage.setItem(TOKEN_KEY, json.token);

      // Merge rather than replace: preserve anything the UI already knows
      // (e.g. a name captured during registration).
      let previous: Record<string, unknown> = {};
      try {
        const raw = localStorage.getItem(USER_KEY);
        if (raw) previous = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        previous = {};
      }
      if (json.user) {
        localStorage.setItem(USER_KEY, JSON.stringify({ ...previous, ...json.user }));
      }
      announce();
      return true;
    } catch {
      return false;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * Store an API JWT (and the user object the server returned with it).
 *
 * Used by the fragment-based sign-in page, which performs its own exchange so
 * it can read `profileCompleted` out of the response. Merges into whatever
 * identity is already cached rather than replacing it.
 */
export function persistApiSession(token: string, user: Record<string, unknown> | null) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TOKEN_KEY, token);

    let previous: Record<string, unknown> = {};
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) previous = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      previous = {};
    }
    if (user) localStorage.setItem(USER_KEY, JSON.stringify({ ...previous, ...user }));
    announce();
  } catch {
    /* storage unavailable — non-fatal */
  }
}

function persistSupabaseIdentity(session: {
  access_token: string;
  user?: unknown;
}) {
  try {
    const user = (session.user ?? {}) as Record<string, unknown>;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const identifier = String(user.email ?? user.phone ?? user.id ?? '').toLowerCase();
    if (!identifier) return;
    const raw = localStorage.getItem(USER_KEY);
    const previous = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      localStorage.setItem(
        USER_KEY,
        JSON.stringify({
          ...previous,
          id: user.id,
          identifier,
          email: user.email ?? null,
          fullName: (meta.full_name as string) || (meta.name as string) || previous.fullName,
          role: (user.app_metadata as Record<string, string> | undefined)?.role || 'customer',
        })
      );
    // Let the header and every data hook know an identity is available, even
    // though the JWT exchange did not succeed.
    announce();
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/**
 * Awaited by every page before its first API call.
 *
 * De-duplicates the exchange across callers, so N components mounting at once
 * produce exactly one network round trip. Resolves `false` (never rejects) when
 * there is no Supabase session or the API is unreachable — callers then fall
 * back to the raw Supabase access token, which the server also accepts.
 */
export function ensureApiSession(force = false): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (force) inflight = null;
  return exchangeSupabaseSession(force);
}

/**
 * Best-effort bearer token for the Express API.
 *
 * Resolution order:
 *   1. our own JWT in localStorage (preferred)
 *   2. a freshly exchanged JWT
 *   3. the Supabase access token — the server verifies Supabase tokens too, so
 *      data calls keep working even if `/api/auth/supabase-session` is down
 */
export async function getAuthToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  if (hasUsableApiToken()) return localStorage.getItem(TOKEN_KEY);

  await ensureApiSession();
  const exchanged = localStorage.getItem(TOKEN_KEY);
  if (exchanged && hasUsableApiToken()) return exchanged;

  try {
    const supabase = getSupabase();
    const { data } = await (supabase?.auth.getSession() ?? Promise.resolve({ data: null }));
    const accessToken = data?.session?.access_token;
    if (accessToken) return accessToken;
  } catch {
    /* fall through */
  }

  // Last resort: a Supabase token left in the slot by an older build. The
  // server accepts it, so this is better than sending nothing.
  return localStorage.getItem(TOKEN_KEY);
}

/** Drop the API-side session (called on sign-out). */
export function clearApiSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  inflight = null;
  announce();
}
