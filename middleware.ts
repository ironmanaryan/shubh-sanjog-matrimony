import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** PostgREST error code for "relation does not exist". */
const TABLE_MISSING = 'PGRST205';

const PROTECTED = ['/plans', '/checkout', '/customer', '/members'];

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

function isProtected(pathname: string): boolean {
  return PROTECTED.some((base) => isUnder(pathname, base));
}

/**
 * Session refresh + route protection.
 *
 * `/login` and `/register` are in the matcher even though they are public:
 * `supabase.auth.getUser()` is what refreshes an expiring access token and
 * writes the renewed cookie back onto the response. Skipping it on the pages
 * where people spend the most time is exactly how sessions used to expire
 * mid-visit and "log the user out" for no reason.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const pathname = request.nextUrl.pathname;

  // Never touch the OAuth callback — it owns its own cookie writes.
  if (isUnder(pathname, '/auth')) {
    return supabaseResponse;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isFillDetails = isUnder(pathname, '/register/fill-details');

  if (isFillDetails && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', '/register/fill-details');
    return NextResponse.redirect(url);
  }

  if (!isProtected(pathname)) {
    return supabaseResponse;
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // ─── Profile completion gate ──────────────────────────────────────────────
  // A signed-in user with no completed profile is sent to the onboarding form
  // exactly once. If the `profiles` table has not been migrated yet we let them
  // through instead of redirecting in a loop.
  let isCompleted = false;
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('is_completed')
      .or(`id.eq.${user.id},user_id.eq.${user.id}`)
      .maybeSingle();

    if (error) {
      if ((error as { code?: string }).code === TABLE_MISSING) {
        isCompleted = true;
      } else {
        console.warn('[middleware] profile lookup failed:', error.message);
      }
    } else if (profile) {
      const v = (profile as Record<string, unknown>)['is_completed'];
      isCompleted = v === true || v === 'true' || v === 1 || v === '1';
    } else {
      // No row yet — the row may have been written under `user_id` only, or by
      // a client that used a different key column. One extra probe per
      // unresolved sign-in is cheap; three per request was not.
      const { data: byId } = await supabase
        .from('profiles')
        .select('is_completed')
        .eq('id', user.id)
        .maybeSingle();
      if (byId) {
        const v = (byId as Record<string, unknown>)['is_completed'];
        isCompleted = v === true || v === 'true' || v === 1 || v === '1';
      }
    }
  } catch {
    // Storage unreachable — do not lock a signed-in user out of their account
    // because of a transient database error.
    isCompleted = true;
  }

  if (!isCompleted && !isFillDetails) {
    const url = request.nextUrl.clone();
    url.pathname = '/register/fill-details';
    url.search = '';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/plans',
    '/plans/:path*',
    '/checkout',
    '/checkout/:path*',
    '/customer',
    '/customer/:path*',
    '/members',
    '/members/:path*',
    '/register',
    '/register/:path*',
    '/login',
  ],
};
