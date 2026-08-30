'use client';

// Shared API helper for the customer surface area.
//
// Production contract: all data comes from the Express API backed by MongoDB.
// There are NO demo/mock fallbacks — failures surface real error messages so
// users always know the true state of their data.
//
//   import { requestJson } from '@/lib/api-client';

// Re-exported so existing `import { API } from '@/lib/api-client'` keep working.
// The resolution logic lives in lib/api-base.ts (no 'use client' there, so it is
// safe to import from server code too).
export { API } from './api-base';
import { API } from './api-base';

// fetch() throws TypeError on network failure ("TypeError: Failed to fetch").
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

/**
 * Mutation/GET helper (POST/PUT/…) that never throws on network failure.
 * Returns `{ ok, json }` like a normal response envelope plus `networkError`
 * so callers can distinguish "offline" from "server rejected the request".
 */
export async function requestJson<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; json: T | null; networkError: boolean }> {
  try {
    const url = /^https?:\/\//.test(path) ? path : `${API}${path}`;
    const res = await fetch(url, init);
    const json: T | null = await res.json().catch(() => null);
    return { ok: res.ok, json, networkError: false };
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    // Network failure ("TypeError: Failed to fetch") — handled quietly.
    return { ok: false, json: null, networkError: true };
  }
}
