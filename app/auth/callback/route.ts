import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || requestUrl.searchParams.get('redirect') || null;

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
              // The `setAll` method was called from a Server Component.
            }
          },
        },
      }
    );

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        let isCompleted = false;

        // Check `profiles` table with is_completed flag
        try {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('is_completed, id, user_id')
            .or(`id.eq.${user.id},user_id.eq.${user.id}`)
            .maybeSingle();

          if (!profileError && profile) {
            const val = (profile as Record<string, unknown>)['is_completed'];
            isCompleted = val === true || val === 'true' || val === 1 || val === '1';
          }
        } catch {
          // ignore, treat as not completed
        }

        // Fallback: try separate queries if `or` not supported
        if (!isCompleted) {
          try {
            const { data: byId } = await supabase
              .from('profiles')
              .select('is_completed')
              .eq('id', user.id)
              .maybeSingle();
            if (byId) {
              const v = (byId as Record<string, unknown>)['is_completed'];
              if (v === true || v === 'true' || v === 1) isCompleted = true;
            }
          } catch {}
        }
        if (!isCompleted) {
          try {
            const { data: byUserId } = await supabase
              .from('profiles')
              .select('is_completed')
              .eq('user_id', user.id)
              .maybeSingle();
            if (byUserId) {
              const v = (byUserId as Record<string, unknown>)['is_completed'];
              if (v === true || v === 'true' || v === 1) isCompleted = true;
            }
          } catch {}
        }

        if (isCompleted) {
          const redirectTo = next && next.startsWith('/') ? next : '/customer';
          return NextResponse.redirect(new URL(redirectTo, requestUrl.origin));
        } else {
          return NextResponse.redirect(new URL('/register/fill-details?step=1', requestUrl.origin));
        }
      }
    }
  }

  // No code or exchange failed — if next exists, honor it, otherwise check auth state again
  if (code) {
    return NextResponse.redirect(new URL('/register/fill-details?step=1', requestUrl.origin));
  }
  if (next) {
    const safeNext = next.startsWith('/') ? next : '/customer';
    return NextResponse.redirect(new URL(safeNext, requestUrl.origin));
  }

  return NextResponse.redirect(new URL('/customer', requestUrl.origin));
}
