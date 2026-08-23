'use client';

// Shared API helper for the customer surface area.
//
// Resilience contract (dev/demo): when the Express API is unreachable the
// helpers below resolve SILENTLY to realistic mock data instead of throwing or
// logging intrusive errors. The UI keeps rendering; callers can check
// `fromMock` if they want to show a gentle offline note.
//
//   import { fetchJsonWithFallback, requestJson } from '@/lib/api-client';

export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

// fetch() throws TypeError on network failure ("TypeError: Failed to fetch").
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

export type FallbackResult<T> = {
  data: T;
  /** true when the live API could not be reached and `mock` was served */
  fromMock: boolean;
};

/**
 * GET JSON from `${API}${path}` — never throws, never logs.
 * On any failure (network error or non-2xx) the provided `mock` value is
 * returned so the caller's UI stays fully populated.
 */
export async function fetchJsonWithFallback<T>(
  path: string,
  options: { headers?: HeadersInit; mock: T }
): Promise<FallbackResult<T>> {
  try {
    // Accept either an API-relative path ('/documents') or an absolute URL.
    const url = /^https?:\/\//.test(path) ? path : `${API}${path}`;
    const res = await fetch(url, { headers: options.headers });
    if (!res.ok) return { data: options.mock, fromMock: true };
    const json = (await res.json()) as T;
    return { data: json ?? options.mock, fromMock: false };
  } catch {
    // Network failure — serve demo data quietly.
    return { data: options.mock, fromMock: true };
  }
}

/**
 * Mutation helper (POST/PUT/…) that never throws on network failure.
 * Returns `{ ok, json }` like a normal response envelope plus `networkError`
 * so callers can distinguish "offline" from "server rejected the request".
 */
export async function requestJson(
  path: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; json: unknown; networkError: boolean }> {
  try {
    const url = /^https?:\/\//.test(path) ? path : `${API}${path}`;
    const res = await fetch(url, init);
    const json: unknown = await res.json().catch(() => null);
    return { ok: res.ok, json, networkError: false };
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    // Network failure ("TypeError: Failed to fetch") — handled quietly.
    return { ok: false, json: null, networkError: true };
  }
}
