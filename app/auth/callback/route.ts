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
      console.error('[auth/callback] exchangeCodeForSession error:', error.message);
    }

    if (session?.user && !error) {
      // Ensure profile exists — always create stub if missing, with is_completed:false
      // This guarantees Google login always creates a DB record, even on first login
      let profile: { is_completed: boolean | null } | null = null;
      let profileError: { code?: string; message: string } | null = null;
      try {
        const res = await supabase
          .from('profiles')
          .select('is_completed')
          .eq('id', session.user.id)
          .maybeSingle();
        profile = res.data as { is_completed: boolean | null } | null;
        profileError = res.error as { code?: string; message: string } | null;
      } catch (e) {
        profileError = { message: e instanceof Error ? e.message : String(e) };
      }

      if (profileError && (profileError as { code?: string }).code === 'PGRST205') {
        // Table missing — log and allow to customer (fallback to localStorage/Express API)
        console.warn('[auth/callback] profiles table missing (PGRST205), allowing to /customer');
        return NextResponse.redirect(new URL('/customer', request.url));
      }

      // If no profile, create one immediately with basic Google info
      if (!profile) {
        try {
          const meta = session.user.user_metadata as Record<string, unknown>;
          const fullName =
            (meta?.['full_name'] as string) ||
            (meta?.['name'] as string) ||
            (session.user.email ? session.user.email.split('@')[0] : '') ||
            '';
          const avatar = (meta?.['avatar_url'] as string) || (meta?.['picture'] as string) || null;
          const { error: upsertError } = await supabase.from('profiles').upsert(
            {
              id: session.user.id,
              user_id: session.user.id,
              email: session.user.email,
              full_name: fullName,
              avatar_url: avatar,
              photo_url: avatar,
              is_completed: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as never,
            { onConflict: 'id' } as never
          );
          if (upsertError) console.error('[auth/callback] profiles upsert error:', upsertError.message);
          else console.log('[auth/callback] created profile stub for', session.user.id);
        } catch (e) {
          console.error('[auth/callback] upsert exception', e);
        }
        // Also ensure users table has entry
        try {
          await supabase.from('users').upsert(
            {
              id: session.user.id,
              identifier: (session.user.email || session.user.id).toLowerCase(),
              email: session.user.email,
              full_name:
                ((session.user.user_metadata as Record<string, unknown>)?.['full_name'] as string) ||
                ((session.user.user_metadata as Record<string, unknown>)?.['name'] as string) ||
                '',
              role: 'customer',
            } as never,
            { onConflict: 'id' } as never
          );
        } catch {}
        return NextResponse.redirect(new URL('/register/fill-details?welcome=true', request.url));
      }

      if (!profile.is_completed) {
        return NextResponse.redirect(new URL('/register/fill-details?welcome=true', request.url));
      } else {
        return NextResponse.redirect(new URL('/customer', request.url));
      }
    } else if (!session?.user) {
      console.error('[auth/callback] no session after exchange, error:', error?.message || 'no session');
    }
  }

  return NextResponse.redirect(new URL('/register/fill-details?welcome=true', request.url));
}
