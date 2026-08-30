import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** PostgREST error code for "relation does not exist". */
const TABLE_MISSING = 'PGRST205';

/**
 * Only same-site absolute paths are acceptable redirect targets. Rejecting
 * protocol-relative (`//evil.com`) and absolute URLs prevents the `next`
 * parameter from being used as an open redirect.
 */
function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

type ProfileRow = { is_completed?: boolean | string | number | null } | null;

function errorRedirect(request: Request, reason: string, detail?: string) {
  const url = new URL('/login', request.url);
  url.searchParams.set('error', reason);
  if (detail) url.searchParams.set('detail', detail.slice(0, 200));
  return NextResponse.redirect(url);
}

function env(name: string): string {
  return (process.env[name] || '').trim();
}

/**
 * Parse a `Cookie:` header into name/value pairs.
 *
 * A Next.js route handler receives a Web `Request`, which has no `cookies`
 * property — reading the header keeps the typing honest and works in both the
 * Node and Edge runtimes.
 */
function parseCookies(header: string): Map<string, string> {
  const jar = new Map<string, string>();
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    jar.set(name, decodeURIComponent(part.slice(eq + 1).trim()));
  }
  return jar;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  const supabaseUrl = env('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    console.error('[auth/callback] Supabase env missing — cannot complete sign-in.');
    return errorRedirect(request, 'config', 'Supabase environment is not configured.');
  }

  // Supabase reports failures (expired code, redirect URL not allow-listed,
  // provider error) as query params on this same callback URL. Surface them
  // instead of bouncing the visitor around in a silent loop.
  const providerError =
    requestUrl.searchParams.get('error') ||
    requestUrl.searchParams.get('error_code') ||
    requestUrl.searchParams.get('error_description');

  if (!code) {
    console.error('[auth/callback] missing code —', providerError ?? 'no query params');
    return errorRedirect(request, 'auth', providerError ?? 'Sign-in did not complete.');
  }

  if (providerError) {
    console.error('[auth/callback] provider error:', providerError);
    return errorRedirect(request, 'auth', providerError);
  }

  // `next` travels through the OAuth round trip in a cookie (see
  // lib/google-auth.ts) because Supabase matches redirect URLs against an
  // allow-list, so it cannot safely be passed as a query param here.
  const cookieHeader = request.headers.get('cookie') || '';
  const cookieNext = /shubh_sanjog_next=([^;]+)/.exec(cookieHeader);
  const nextPath = safeNextPath(
    requestUrl.searchParams.get('next') ||
      (cookieNext ? decodeURIComponent(cookieNext[1]) : null)
  );
  const requestCookies = parseCookies(cookieHeader);

  //
  // Cookie handling — the part that used to break silently.
  //
  // The session cookies must travel on the SAME response that performs the
  // redirect. We therefore buffer every cookie Supabase asks us to write and
  // replay them onto the final `NextResponse.redirect(...)`. We also mirror
  // them into an in-memory map so subsequent reads inside this request see
  // the values we just wrote.
  //
  const cookieMap = new Map<string, string>(requestCookies);
  const pending: { name: string; value: string; options?: CookieOptions }[] = [];

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return Array.from(cookieMap, ([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieMap.set(name, value);
          pending.push({ name, value, options });
        }
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  let user = data?.session?.user ?? data?.user ?? null;
  if (!user && !error) {
    try {
      const { data: recovered } = await supabase.auth.getUser();
      user = recovered?.user ?? null;
    } catch {
      user = null;
    }
  }

  if (error || !user) {
    console.error('[auth/callback] exchange failed:', error?.message ?? 'no user returned');
    const res = errorRedirect(request, 'auth', error?.message);
    // Still clear any stale auth cookie so the user is not stuck half-signed-in.
    for (const { name, value, options } of pending) res.cookies.set(name, value, options);
    return res;
  }

  // ─── Profile bootstrap ────────────────────────────────────────────────────
  // A brand-new Google user has no `profiles` row. Without one the middleware
  // would bounce them to /register/fill-details forever without ever creating
  // the row they are being sent to fill in.
  let isCompleted = false;
  try {
    const { data: profile, error: profileError } = (await supabase
      .from('profiles')
      .select('is_completed')
      .or(`id.eq.${user.id},user_id.eq.${user.id}`)
      .maybeSingle()) as { data: ProfileRow; error: { code?: string; message: string } | null };

    if (profileError) {
      if (profileError.code === TABLE_MISSING) {
        // Schema not applied yet — allow through rather than looping forever.
        console.warn('[auth/callback] profiles table missing; allowing access');
        isCompleted = true;
      } else {
        console.error('[auth/callback] profile lookup failed:', profileError.message);
        // Treat an unreadable profile as "not completed": the user is sent to
        // the form, which writes a complete row and unblocks them.
        isCompleted = false;
      }
    } else if (profile) {
      isCompleted = isTruthyFlag(profile.is_completed);
    } else {
      isCompleted = await createProfileStub(user);
    }
  } catch (e) {
    console.error(
      '[auth/callback] profile bootstrap exception:',
      e instanceof Error ? e.message : String(e)
    );
  }

  const target = isCompleted
    ? new URL(nextPath || '/customer', request.url)
    : (() => {
        const details = new URL('/register/fill-details', request.url);
        details.searchParams.set('welcome', 'true');
        if (nextPath) details.searchParams.set('next', nextPath);
        return details;
      })();

  // Strip the one-shot `next` cookie now that it has served its purpose.
  const response = NextResponse.redirect(target);
  for (const { name, value, options } of pending) {
    response.cookies.set(name, value, options);
  }
  response.cookies.set('shubh_sanjog_next', '', { path: '/', maxAge: 0 });

  console.log(
    '[auth/callback] sign-in ok for',
    user.email ?? user.id,
    '->',
    target.pathname,
    `(${pending.length} cookies)`
  );
  return response;
}

/**
 * Service-role client for the bootstrap writes.
 *
 * `users` has RLS enabled with no public policies, so an anon-key upsert is
 * rejected outright. The service key bypasses RLS — it is only read inside this
 * server-only route handler and is never exposed to the browser.
 */
function adminClient(supabaseUrl: string) {
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_KEY');
  if (!serviceKey) return null;
  try {
    return createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  } catch {
    return null;
  }
}

/**
 * Create the minimal profile + user rows for a first-time sign-in.
 * Returns true when the profile is already considered complete (never here).
 */
async function createProfileStub(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): Promise<boolean> {
  const meta = user.user_metadata ?? {};
  const fullName =
    (meta.full_name as string) || (meta.name as string) || (user.email ? user.email.split('@')[0] : '');
  const avatar = (meta.avatar_url as string) || (meta.picture as string) || null;
  const now = new Date().toISOString();

  // Prefer the service role (bypasses RLS); fall back to the anon key so a
  // deployment without SUPABASE_SERVICE_ROLE_KEY still writes the `profiles`
  // row, which is the one the middleware gates on.
  const writer =
    adminClient(env('NEXT_PUBLIC_SUPABASE_URL')) ??
    (() => {
      const url = env('NEXT_PUBLIC_SUPABASE_URL');
      const key = env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
      return url && key
        ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
        : null;
    })();

  if (!writer) {
    console.error('[auth/callback] no usable Supabase client for profile bootstrap');
    return false;
  }

  try {
    const { error } = await writer.from('profiles').upsert(
      {
        id: user.id,
        user_id: user.id,
        email: user.email ?? null,
        full_name: fullName,
        avatar_url: avatar,
        photo_url: avatar,
        is_completed: false,
        created_at: now,
        updated_at: now,
      } as never,
      { onConflict: 'id' } as never
    );
    if (error) console.error('[auth/callback] profile upsert failed:', error.message);
  } catch (e) {
    console.error('[auth/callback] profile upsert exception:', e instanceof Error ? e.message : e);
  }

  try {
    const { error } = await writer.from('users').upsert(
      {
        id: user.id,
        identifier: (user.email || user.id).toLowerCase(),
        email: user.email ?? null,
        full_name: fullName,
        role: 'customer',
        // `users.created_at` is a bigint epoch — an ISO string would be rejected.
        created_at: Date.now(),
        deleted_at: null,
      } as never,
      { onConflict: 'id' } as never
    );
    if (error) console.error('[auth/callback] users upsert failed:', error.message);
  } catch (e) {
    console.error('[auth/callback] users upsert exception:', e instanceof Error ? e.message : e);
  }

  return false;
}
