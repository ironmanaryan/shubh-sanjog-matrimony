'use client';

// Mounted once in the root layout. Keeps the API session in sync with the
// Supabase session so that *every* sign-in path — Google OAuth, email OTP, or a
// silent token refresh — ends with a usable JWT for the Express API.
//
// Renders nothing; it exists purely for its effect.

import { useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
import { exchangeSupabaseSession } from '@/lib/session-bridge';

export default function SessionBridge() {
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    // Catch up on first load — e.g. right after the OAuth callback redirects
    // here, when the cookie session exists but no API token has been minted yet.
    void exchangeSupabaseSession();

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      // TOKEN_REFRESHED must force a re-exchange: the old JWT still looks valid
      // but the underlying identity/role may have changed.
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        void exchangeSupabaseSession(true);
      }
      if (event === 'SIGNED_OUT') {
        void import('@/lib/session-bridge').then((m) => m.clearApiSession());
      }
    });

    return () => {
      subscription?.subscription?.unsubscribe();
    };
  }, []);

  return null;
}
