'use client';

// Google Sign-In button powered by Google Identity Services (GIS) via
// @react-oauth/google. Replaces the previous signInWithOAuth PKCE flow
// (see lib/google-auth.ts for the helper it delegates to).
//
// Why this design:
//   - GIS returns an ID token directly to the browser; we exchange it with
//     Supabase using `supabase.auth.signInWithIdToken({ provider: 'google',
//     token })`. No full-page redirect, no /auth/callback allow-list entry.
//   - The styled wrapper matches the existing site chrome (pill button,
//     Google "G" logo). The actual <GoogleLogin/> button is rendered
//     absolutely-positioned over it so a click on the visible button hits
//     the GIS iframe's click target. Width 0 keeps it invisible.
//   - On success we redirect to /customer (the actual customer dashboard,
//     per project convention; the brief said /dashboard but no such route
//     exists). The SessionBridge will already have exchanged the Supabase
//     session for a platform JWT in response to the SIGNED_IN event.
//   - If NEXT_PUBLIC_GOOGLE_CLIENT_ID is missing on this deployment, we
//     render a disabled state with an inline note instead of letting GIS
//     crash. Existing deployments before this change weren't configured
//     for GIS either, so this keeps the UI honest.

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { Loader2 } from 'lucide-react';
import { signInWithGoogleIdToken } from '@/lib/google-auth';

type StatusTone = 'idle' | 'working' | 'error';

interface GoogleLoginButtonProps {
  /** Where to send the user after a successful sign-in. Defaults to /customer. */
  redirectTo?: string;
  /** Optional click hook — fires before the GIS flow starts. */
  onClick?: () => void;
}

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export default function GoogleLoginButton({ redirectTo = '/customer', onClick }: GoogleLoginButtonProps) {
  const router = useRouter();
  const [tone, setTone] = useState<StatusTone>('idle');
  const [error, setError] = useState<string | null>(null);

  // When the GIS client ID is missing we still want the page to render
  // without crashing — show a disabled button with an explanation.
  const [hasClientId, setHasClientId] = useState<boolean | null>(null);
  useEffect(() => {
    setHasClientId(Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID));
  }, []);

  const handleSuccess = useCallback(
    async (credentialResponse: CredentialResponse) => {
      setTone('working');
      setError(null);
      const idToken = credentialResponse?.credential;
      if (!idToken) {
        setTone('error');
        setError('Google did not return an ID token. Please try again.');
        return;
      }
      const result = await signInWithGoogleIdToken(idToken);
      if (!result.ok) {
        setTone('error');
        setError(result.error || 'Google sign-in failed. Please try again.');
        return;
      }
      // SessionBridge listens for the SIGNED_IN event and exchanges the
      // Supabase session for a platform JWT automatically; we just need to
      // navigate to the customer dashboard.
      router.push(redirectTo);
      router.refresh();
    },
    [redirectTo, router]
  );

  const handleError = useCallback(() => {
    setTone('error');
    setError('Google sign-in was cancelled or failed. Please try again.');
  }, []);

  const resetError = useCallback(() => {
    if (tone === 'error') {
      setTone('idle');
      setError(null);
    }
  }, [tone]);

  const busy = tone === 'working';

  if (hasClientId === false) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-[#e8e0d5] bg-[#fffaf8] p-4 text-sm text-[#5a3743]"
      >
        <p className="font-semibold text-[#2c0d16]">Google sign-in is unavailable</p>
        <p className="mt-1 leading-5">
          The deployment is missing <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>. Use email sign-in below,
          or ask the operator to configure the Google OAuth client.
        </p>
      </div>
    );
  }

  // While we don't yet know whether the client ID is present, render a
  // visually-stable placeholder so the layout doesn't jump on hydration.
  if (hasClientId === null) {
    return (
      <div className="flex min-h-[48px] w-full items-center justify-center rounded-full border border-[#e8e0d5] bg-white px-6 py-3.5 text-sm font-semibold text-[#2c0d16] shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin text-[#800020]" />
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Visible styled button. Sits on top of the GIS iframe-button so a
          click on it is forwarded to GIS's click target. */}
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={() => {
          resetError();
          onClick?.();
        }}
        className="group flex min-h-[48px] w-full touch-manipulation items-center justify-center gap-3 rounded-full border border-[#e8e0d5] bg-white px-6 py-3.5 text-[15px] font-semibold text-[#2c0d16] shadow-sm transition-all duration-200 hover:border-[#d4c4b0] hover:bg-[#fffaf8] hover:shadow-md active:scale-[0.98] disabled:opacity-60"
      >
        <GoogleLogo />
        <span>{busy ? 'Signing you in…' : 'Continue with Google'}</span>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-[#800020]" />}
      </button>

      {/* GIS-rendered button. Same outer dimensions so it covers the visible
          wrapper; opacity 0 makes it invisible while still capturing the click.
          useOneTap={false} keeps it as a single explicit button rather than the
          one-tap auto-prompt. type="standard" matches our pill shape. */}
      <div className="absolute inset-0 overflow-hidden opacity-0" aria-hidden="true">
        <GoogleLogin
          onSuccess={handleSuccess}
          onError={handleError}
          useOneTap={false}
          type="standard"
          theme="outline"
          size="large"
          shape="pill"
          text="continue_with"
        />
      </div>

      {tone === 'error' && error && (
        <p
          role="alert"
          aria-live="polite"
          className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-[#9b1f2f]"
        >
          {error}
        </p>
      )}
    </div>
  );
}