// Single source of truth for the API base URL.
//
// The API is mounted inside the Next.js app at /api (see
// app/api/[...path]/route.ts), so in production it is served from the same
// origin as the site. That is the default: no env var required, no CORS, no
// separate deployment.
//
// This file deliberately carries no 'use client' directive so it can be imported
// from Server Components, Client Components and route handlers alike.

const configured = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');

function serverSideDefault(): string {
  // Server-side rendering has no origin to be relative to, so build one.
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '').trim();
  if (explicit) return `${explicit.replace(/\/+$/, '')}/api`;

  // Vercel exposes the deployment hostname without a protocol.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/+$/, '')}/api`;

  return 'http://localhost:3000/api';
}

/**
 * Base URL for API calls, e.g. `/api` or `https://example.com/api`.
 *
 * Resolution order:
 *   1. `NEXT_PUBLIC_API_URL` — explicit override (self-hosted split deployments)
 *   2. browser               — `/api`, i.e. same origin as the page
 *   3. server                — derived from the deployment URL
 */
export const API: string =
  configured.length > 0 ? configured : typeof window !== 'undefined' ? '/api' : serverSideDefault();
