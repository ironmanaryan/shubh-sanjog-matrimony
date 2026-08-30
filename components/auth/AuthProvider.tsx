'use client';

// Single source of truth for "who is signed in" in the UI.
//
// Before this existed there was no shared auth state at all: the header always
// rendered "Login / Registration" and each page re-derived the session on its
// own from localStorage. A user who signed in with Google had a perfectly valid
// Supabase cookie session, so the middleware happily served /customer — but the
// navigation never changed, which made it look like the sign-in had failed.
//
// This provider reads the Supabase session (the real one, in cookies), keeps the
// matching `profiles` row alongside it, and re-renders on every auth event.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getSupabase } from '@/lib/supabase';
import { signOut as signOutEverywhere } from '@/lib/auth-client';

export type AuthUserLite = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export type ProfileLite = {
  full_name?: string | null;
  photo_url?: string | null;
  avatar_url?: string | null;
  email?: string | null;
  is_completed?: boolean | null;
};

type AuthState = {
  user: AuthUserLite | null;
  profile: ProfileLite | null;
  /** True until the first session read completes — never show "Login" during it. */
  loading: boolean;
  displayName: string;
  photoUrl: string | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  profile: null,
  loading: true,
  displayName: '',
  photoUrl: null,
  signOut: async () => {},
});

function metaString(meta: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!meta) return '';
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserLite | null>(null);
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadProfile = async (uid: string) => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('full_name,photo_url,avatar_url,email,is_completed')
          .or(`id.eq.${uid},user_id.eq.${uid}`)
          .maybeSingle();
        if (!cancelled) setProfile((data as ProfileLite) ?? null);
      } catch {
        /* profiles table may not exist yet — the name from auth metadata still works */
      }
    };

    const apply = (next: AuthUserLite | null) => {
      if (cancelled) return;
      setUser(next);
      setLoading(false);
      if (next) void loadProfile(next.id);
      else setProfile(null);
    };

    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user ?? null;
      apply(u ? { id: u.id, email: u.email ?? null, user_metadata: u.user_metadata ?? null } : null);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      apply(u ? { id: u.id, email: u.email ?? null, user_metadata: u.user_metadata ?? null } : null);
    });

    return () => {
      cancelled = true;
      subscription?.subscription?.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await signOutEverywhere();
    setUser(null);
    setProfile(null);
  }, []);

  const value = useMemo<AuthState>(() => {
    const metaName = metaString(user?.user_metadata, 'full_name', 'name');
    const photo =
      metaString(user?.user_metadata, 'avatar_url', 'picture') ||
      profile?.photo_url ||
      profile?.avatar_url ||
      null;

    return {
      user,
      profile,
      loading,
      displayName:
        profile?.full_name?.trim() || metaName || user?.email?.split('@')[0] || 'My account',
      photoUrl: photo || null,
      signOut,
    };
  }, [user, profile, loading, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
