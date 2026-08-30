import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

  // Allow auth callback and static assets without checks
  if (pathname.startsWith('/auth/')) {
    return supabaseResponse;
  }

  const isFillDetails = pathname === '/register/fill-details' || pathname.startsWith('/register/fill-details/');
  const isRegister = pathname === '/register' || pathname.startsWith('/register');

  // Protected routes: /plans, /checkout, /customer/*, /members
  const isProtected =
    pathname === '/plans' ||
    pathname.startsWith('/plans/') ||
    pathname === '/checkout' ||
    pathname.startsWith('/checkout/') ||
    pathname === '/customer' ||
    pathname.startsWith('/customer/') ||
    pathname === '/members' ||
    pathname.startsWith('/members/');

  // If accessing fill-details without login, redirect to /register
  if (isFillDetails && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/register';
    return NextResponse.redirect(url);
  }

  if (isProtected) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/register';
      return NextResponse.redirect(url);
    }

    // Logged in — check if profile is completed
    // If profiles table is missing (PGRST205), treat as completed to avoid infinite redirect until migration is run
    let isCompleted = false;
    let tableMissing = false;
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_completed')
        .or(`id.eq.${user.id},user_id.eq.${user.id}`)
        .maybeSingle();
      if (error && (error as { code?: string }).code === 'PGRST205') tableMissing = true;
      if (profile) {
        const v = (profile as Record<string, unknown>)['is_completed'];
        isCompleted = v === true || v === 'true' || v === 1 || v === '1';
      }
    } catch {}

    if (!isCompleted && !tableMissing) {
      try {
        const { data: byId, error } = await supabase
          .from('profiles')
          .select('is_completed')
          .eq('id', user.id)
          .maybeSingle();
        if (error && (error as { code?: string }).code === 'PGRST205') tableMissing = true;
        if (byId) {
          const v = (byId as Record<string, unknown>)['is_completed'];
          if (v === true || v === 'true' || v === 1) isCompleted = true;
        }
      } catch {}
    }

    if (!isCompleted && !tableMissing) {
      try {
        const { data: byUserId, error } = await supabase
          .from('profiles')
          .select('is_completed')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error && (error as { code?: string }).code === 'PGRST205') tableMissing = true;
        if (byUserId) {
          const v = (byUserId as Record<string, unknown>)['is_completed'];
          if (v === true || v === 'true' || v === 1) isCompleted = true;
        }
      } catch {}
    }

    // If table is missing, allow access (avoid loop) - profile will be handled via Express API fallback
    if (tableMissing) {
      isCompleted = true;
    }

    if (!isCompleted) {
      // Only allow full access once profile is completed
      if (!isFillDetails) {
        const url = request.nextUrl.clone();
        url.pathname = '/register/fill-details';
        url.searchParams.set('step', '1');
        return NextResponse.redirect(url);
      }
    }
  }

  // Optional: if user is logged in and completed but visits /register, allow? Keep as is, don't force redirect

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
    '/register/fill-details',
    '/register/fill-details/:path*',
  ],
};
