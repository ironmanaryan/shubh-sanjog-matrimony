import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

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

    const { data: { session } } = await supabase.auth.exchangeCodeForSession(code);

    if (session?.user) {
      // Check profile completion status
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_completed')
        .eq('id', session.user.id)
        .single();

      if (!profile || !profile.is_completed) {
        return NextResponse.redirect(`${requestUrl.origin}/register/fill-details?welcome=true`);
      } else {
        return NextResponse.redirect(`${requestUrl.origin}/customer`);
      }
    }
  }

  return NextResponse.redirect(requestUrl.origin);
}
