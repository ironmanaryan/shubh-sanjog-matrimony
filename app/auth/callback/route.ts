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
        // Ensure a profile stub exists so login via Google always creates a DB record
        if (!profile) {
          try {
            const meta = session.user.user_metadata as Record<string, unknown>;
            const fullName =
              (meta?.['full_name'] as string) ||
              (meta?.['name'] as string) ||
              (session.user.email ? session.user.email.split('@')[0] : '') ||
              '';
            const avatar = (meta?.['avatar_url'] as string) || (meta?.['picture'] as string) || null;
            await supabase.from('profiles').upsert(
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
          } catch {}
          // Fallback to users table if profiles missing (schema not yet applied)
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
        }
        return NextResponse.redirect(new URL('/register/fill-details?welcome=true', request.url));
      } else {
        return NextResponse.redirect(new URL('/customer', request.url));
      }
    }
  }

  return NextResponse.redirect(new URL('/register/fill-details?welcome=true', request.url));
}
