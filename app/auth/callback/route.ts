import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignore inside Server Component
            }
          },
        },
      }
    );

    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code);

    if (session?.user && !error) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_completed')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!profile || !profile.is_completed) {
        return NextResponse.redirect(new URL('/register/fill-details?welcome=true', request.url));
      } else {
        return NextResponse.redirect(new URL('/customer', request.url));
      }
    }
  }

  return NextResponse.redirect(new URL('/register/fill-details?welcome=true', request.url));
}
