'use client';

// Completes a sign-in that arrives with the session in the URL fragment.
//
// Two different Supabase flows return here and they need different handling:
//
//   1. Google OAuth (PKCE)  -> /auth/callback?code=…   (server route, route.ts)
//   2. Email magic link     -> /auth/complete#access_token=…&refresh_token=…
//
// The second case cannot be handled server-side: a URL fragment is never sent
// to the server, so a route handler only ever sees an empty request and bounces
// the visitor back to /login with "Sign-in did not complete". That is exactly
// what happened to anyone who opened the email on their phone — the session was
// valid but nothing ever claimed it.
//
// This page claims it: setSession() -> exchange for the platform JWT -> redirect.

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { API } from '@/lib/api-base';
import { persistApiSession } from '@/lib/session-bridge';
import { NEXT_COOKIE, safeNextPath } from '@/lib/google-auth';
import Loader from '@/components/ui/loader';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(document.cookie);
  return match ? decodeURIComponent(match[1]) : null;
}

function CompleteInner() {
  const router = useRouter();
  const [message, setMessage] = useState('Finishing sign-in…');
  const [failed, setFailed] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) return;
    doneRef.current = true;

    (async () => {
      const supabase = getSupabase();
      if (!supabase) {
        setFailed(true);
        setMessage('Sign-in is not configured on this deployment.');
        return;
      }

      // ── 1. Claim the session from the fragment ────────────────────────────
      const hash = window.location.hash.replace(/^#/, '');
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token') || '';
      const hashError = params.get('error_description') || params.get('error');

      if (hashError) {
        router.replace(`/login?error=auth&detail=${encodeURIComponent(hashError)}`);
        return;
      }

      if (accessToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          router.replace(`/login?error=auth&detail=${encodeURIComponent(error.message)}`);
          return;
        }
        // Scrub the tokens out of the URL and history immediately.
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }

      // ── 2. Confirm we really have a session ───────────────────────────────
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session?.access_token) {
        router.replace('/login?error=auth&detail=Sign-in%20link%20has%20expired.');
        return;
      }

      // ── 3. Trade it for the platform JWT the API expects ──────────────────
      setMessage('Setting up your account…');
      let profileCompleted: boolean | null = null;
      try {
        const res = await fetch(`${API}/auth/supabase-session`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const json = (await res.json().catch(() => ({}))) as {
            token?: string;
            user?: Record<string, unknown>;
            profileCompleted?: boolean | null;
          };
          if (json.token) {
            persistApiSession(json.token, json.user ?? null);
            profileCompleted = json.profileCompleted ?? null;
          }
        } else {
          console.warn('[auth/complete] session exchange returned', res.status);
        }
      } catch (e) {
        // Non-fatal: the API accepts the Supabase access token directly, so the
        // user is still signed in — just without a cached platform JWT.
        console.warn('[auth/complete] exchange failed', e);
      }

      // ── 4. Send them where they were headed ───────────────────────────────
      const next =
        safeNextPath(new URLSearchParams(window.location.search).get('next')) ||
        safeNextPath(readCookie(NEXT_COOKIE));

      if (profileCompleted === false) {
        const url = new URL('/register/fill-details', window.location.origin);
        url.searchParams.set('welcome', 'true');
        if (next) url.searchParams.set('next', next);
        router.replace(url.toString());
        return;
      }

      router.replace(next || '/customer');
    })();
  }, [router]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-[#fffaf8] px-6 text-center">
      {failed ? (
        <p className="max-w-sm text-sm font-medium text-[#9b1f2f]">{message}</p>
      ) : (
        <>
          <Loader variant="lotus" />
          <p className="text-sm font-medium text-[#5a3743]">{message}</p>
        </>
      )}
    </div>
  );
}

export default function AuthCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-[#fffaf8]">
          <Loader variant="lotus" />
        </div>
      }
    >
      <CompleteInner />
    </Suspense>
  );
}
