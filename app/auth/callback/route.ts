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
        let profileExists = false;

        // Check `profiles` table (as per task spec)
        try {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();
          if (!profileError && profile) {
            profileExists = true;
          }
        } catch {
          // profiles table may not exist or query failed — try fallback
        }

        // Fallback: check `profiles` with user_id column
        if (!profileExists) {
          try {
            const { data: profileByUserId, error: e2 } = await supabase
              .from('profiles')
              .select('id, user_id')
              .eq('user_id', user.id)
              .maybeSingle();
            if (!e2 && profileByUserId) {
              profileExists = true;
            }
          } catch {}
        }

        // Fallback: check matrimonial_profiles (actual schema table)
        if (!profileExists) {
          try {
            const { data: mp, error: mpError } = await supabase
              .from('matrimonial_profiles')
              .select('user_id')
              .eq('user_id', user.id)
              .maybeSingle();
            if (!mpError && mp) {
              profileExists = true;
            }
          } catch {}
        }

        // Also check users table existence as last resort for profile inference
        // If user exists but no profile, we still treat as no profile -> onboarding

        if (profileExists) {
          // If user already has a profile, redirect to intended destination or dashboard
          const redirectTo = next ? next : '/customer';
          // Ensure redirect is relative to origin and safe
          const safeRedirect = redirectTo.startsWith('/') ? redirectTo : '/customer';
          return NextResponse.redirect(new URL(safeRedirect, requestUrl.origin));
        } else {
          // New user — needs to create profile
          return NextResponse.redirect(new URL('/create-profile?welcome=true', requestUrl.origin));
        }
      }
    }
  }

  // Fallback: no code or exchange failed — redirect to home or next if provided
  if (next) {
    const safeNext = next.startsWith('/') ? next : '/';
    return NextResponse.redirect(new URL(safeNext, requestUrl.origin));
  }

  return NextResponse.redirect(new URL('/customer', requestUrl.origin));
}
