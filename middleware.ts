import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase env not configured, skip protection (fail open for local dev)
  // Otherwise strictly enforce auth checks
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
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Protected routes: /plans, /checkout, /create-profile, /customer/*
  const isProtected =
    pathname === '/plans' ||
    pathname.startsWith('/plans/') ||
    pathname === '/checkout' ||
    pathname.startsWith('/checkout/') ||
    pathname === '/create-profile' ||
    pathname.startsWith('/create-profile/') ||
    pathname === '/customer' ||
    pathname.startsWith('/customer/');

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/register';
    // Preserve intended destination for post-auth return
    const redirectTo = pathname + request.nextUrl.search;
    url.search = '';
    url.searchParams.set('redirect', redirectTo);
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
    '/create-profile',
    '/create-profile/:path*',
    '/customer',
    '/customer/:path*',
  ],
};
