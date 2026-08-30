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
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
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

    if (error) {
      console.error('[auth/callback] exchangeCodeForSession error:', error.message, 'code:', code.slice(0, 20));
      // Fall through to welcome redirect to allow user to fill details even if exchange had an error but session might still be set via cookies
    }

    // Fallback: if session is null but error is null, try to get user via getUser (cookies may have been set)
    let user = session?.user || null;
    if (!user && !error) {
      try {
        const { data: { user: u } } = await supabase.auth.getUser();
        user = u;
        if (u) console.log('[auth/callback] recovered user via getUser:', u.id);
      } catch {}
    }

    if (user && !error) {
      // Ensure profile exists — always create stub if missing, with is_completed:false
      // This guarantees Google login always creates a DB record, even on first login
      let profile: { is_completed: boolean | null } | null = null;
      let profileError: { code?: string; message: string } | null = null;
      try {
        const res = await supabase
          .from('profiles')
          .select('is_completed')
          .eq('id', user.id)
          .maybeSingle();
        profile = res.data as { is_completed: boolean | null } | null;
        profileError = res.error as { code?: string; message: string } | null;
        if (profileError) console.error('[auth/callback] profile select error:', profileError.code, profileError.message);
      } catch (e) {
        profileError = { message: e instanceof Error ? e.message : String(e) };
        console.error('[auth/callback] profile select exception:', profileError.message);
      }

      if (profileError && (profileError as { code?: string }).code === 'PGRST205') {
        // Table missing — log and allow to customer (fallback to localStorage/Express API)
        console.warn('[auth/callback] profiles table missing (PGRST205), allowing to /customer');
        return NextResponse.redirect(new URL('/customer', request.url));
      }

      // If no profile, create one immediately with basic Google info
      if (!profile) {
        try {
          const meta = user.user_metadata as Record<string, unknown>;
          const fullName =
            (meta?.['full_name'] as string) ||
            (meta?.['name'] as string) ||
            (user.email ? user.email.split('@')[0] : '') ||
            '';
          const avatar = (meta?.['avatar_url'] as string) || (meta?.['picture'] as string) || null;
          const { error: upsertError } = await supabase.from('profiles').upsert(
            {
              id: user.id,
              user_id: user.id,
              email: user.email,
              full_name: fullName,
              avatar_url: avatar,
              photo_url: avatar,
              is_completed: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as never,
            { onConflict: 'id' } as never
          );
          if (upsertError) console.error('[auth/callback] profiles upsert error:', upsertError.message, upsertError);
          else console.log('[auth/callback] created profile stub for', user.id);
        } catch (e) {
          console.error('[auth/callback] upsert exception', e);
        }
        // Also ensure users table has entry
        try {
          await supabase.from('users').upsert(
            {
              id: user.id,
              identifier: (user.email || user.id).toLowerCase(),
              email: user.email,
              full_name:
                ((user.user_metadata as Record<string, unknown>)?.['full_name'] as string) ||
                ((user.user_metadata as Record<string, unknown>)?.['name'] as string) ||
                '',
              role: 'customer',
            } as never,
            { onConflict: 'id' } as never
          );
        } catch (e) {
          console.error('[auth/callback] users upsert error', e);
        }
        return NextResponse.redirect(new URL('/register/fill-details?welcome=true', request.url));
      }

      if (!profile.is_completed) {
        return NextResponse.redirect(new URL('/register/fill-details?welcome=true', request.url));
      } else {
        return NextResponse.redirect(new URL('/customer', request.url));
      }
    } else if (!user) {
      console.error('[auth/callback] no session/user after exchange, error:', error?.message || 'no session', 'code:', code.slice(0, 20));
    }
  }

  return NextResponse.redirect(new URL('/register/fill-details?welcome=true', request.url));
}
