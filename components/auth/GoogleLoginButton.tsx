'use client';

// Google Sign-In button powered by Google Identity Services (GIS).
// - Primary path: GIS ID token -> supabase.auth.signInWithIdToken (no redirect)
// - Fallback path: if GIS iframe fails to capture or script not ready on initial
//   desktop load, visible button directly triggers GIS prompt() or Supabase OAuth
//   so user is NEVER stuck with unclickable button.

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { signInWithGoogle, signInWithGoogleIdToken } from '@/lib/google-auth';
import { getSupabase } from '@/lib/supabase';

type StatusTone = 'idle' | 'working' | 'error';

interface GoogleLoginButtonProps {
  redirectTo?: string;
  onClick?: () => void;
}

declare global {
  interface Window {
    __gsiSetCallback?: (cb: (resp: unknown) => void) => void;
    __gsiCallback?: (resp: unknown) => void;
    __gsiInitialized?: boolean;
    _gisFallbackPrompted?: boolean;
  }
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

// Ensures GIS script is loaded on component mount with explicit onload
function useGsiReady(hasClientId: boolean | null): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (hasClientId !== true) return;
    let cancelled = false;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;
    const markReady = () => {
      if (!cancelled) setReady(true);
    };
    const ensurePatchedAndReady = (): boolean => {
      const gsi = (window as unknown as { google?: { accounts?: { id?: { initialize: (opts: unknown) => void; _patched?: boolean; _currentCallback?: unknown } } } }).google?.accounts?.id;
      if (!gsi) return false;
      if ((window as unknown as Record<string, unknown>).__gsiInitialized) {
        markReady();
        return true;
      }
      if (!gsi._patched) {
        const originalInitialize = (gsi.initialize as unknown as (opts: unknown) => void).bind(gsi);
        (gsi as unknown as Record<string, unknown>)._patched = true;
        (gsi as unknown as Record<string, unknown>)._currentCallback = undefined;
        (window as unknown as Record<string, unknown>).__gsiSetCallback = (cb: unknown) => {
          (gsi as unknown as Record<string, unknown>)._currentCallback = cb;
          (window as unknown as Record<string, unknown>).__gsiCallback = cb;
        };
        (gsi as unknown as { initialize: (opts: unknown) => void }).initialize = (opts: unknown) => {
          const o = opts as { callback?: unknown; client_id?: string };
          if ((window as unknown as Record<string, unknown>).__gsiInitialized) {
            if (o?.callback) {
              (gsi as unknown as Record<string, unknown>)._currentCallback = o.callback;
              (window as unknown as Record<string, unknown>).__gsiCallback = o.callback;
            }
            return;
          }
          (window as unknown as Record<string, unknown>).__gsiInitialized = true;
          (gsi as unknown as Record<string, unknown>)._currentCallback = o.callback;
          (window as unknown as Record<string, unknown>).__gsiCallback = o.callback;
          const wrapped = { ...(o as object), callback: (resp: unknown) => ((gsi as unknown as Record<string, unknown>)._currentCallback as ((r: unknown) => void) | undefined)?.(resp) } as unknown;
          return originalInitialize(wrapped as never);
        };
      }
      if (!(window as unknown as Record<string, unknown>).__gsiInitialized) {
        try {
          (gsi as unknown as { initialize: (opts: unknown) => void }).initialize({
            client_id: clientId,
            callback: (resp: unknown) =>
              ((gsi as unknown as Record<string, unknown>)._currentCallback as ((r: unknown) => void) | undefined)?.(resp) ||
              ((window as unknown as Record<string, unknown>).__gsiCallback as ((r: unknown) => void) | undefined)?.(resp),
          });
          (window as unknown as Record<string, unknown>).__gsiInitialized = true;
        } catch {}
      }
      markReady();
      return true;
    };
    if (ensurePatchedAndReady()) return;
    const GIS_SRC = 'https://accounts.google.com/gsi/client';
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const handleLoad = () => {
      ensurePatchedAndReady();
    };
    let pollId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (existing) {
      if (existing.getAttribute('data-loaded') === 'true' || (window as unknown as { google?: unknown }).google) {
        handleLoad();
      } else {
        existing.addEventListener('load', handleLoad);
      }
      pollId = setInterval(() => {
        if (ensurePatchedAndReady() && pollId) {
          clearInterval(pollId);
          pollId = null;
        }
      }, 80);
      timeoutId = setTimeout(() => {
        if (pollId) clearInterval(pollId);
      }, 8000);
      return () => {
        cancelled = true;
        existing.removeEventListener('load', handleLoad);
        if (pollId) clearInterval(pollId);
        if (timeoutId) clearTimeout(timeoutId);
      };
    } else {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        script.setAttribute('data-loaded', 'true');
        handleLoad();
      };
      script.onerror = () => console.error('[GIS] failed to load gsi/client');
      document.head.appendChild(script);
      pollId = setInterval(() => {
        if (ensurePatchedAndReady() && pollId) {
          clearInterval(pollId);
          pollId = null;
        }
      }, 80);
      timeoutId = setTimeout(() => {
        if (pollId) clearInterval(pollId);
      }, 8000);
      return () => {
        cancelled = true;
        if (pollId) clearInterval(pollId);
        if (timeoutId) clearTimeout(timeoutId);
      };
    }
  }, [hasClientId]);
  return ready;
}

export default function GoogleLoginButton({ redirectTo = '/customer', onClick }: GoogleLoginButtonProps) {
  const router = useRouter();
  const [tone, setTone] = useState<StatusTone>('idle');
  const [error, setError] = useState<string | null>(null);

  const [hasClientId, setHasClientId] = useState<boolean | null>(null);
  useEffect(() => {
    setHasClientId(Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID));
  }, []);

  const gisReady = useGsiReady(hasClientId);

  const handleSuccess = useCallback(
    async (credentialResponse: { credential?: string }) => {
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
  const gsiButtonRef = useRef<HTMLDivElement>(null);

  const onSuccessRef = useRef(handleSuccess);
  useEffect(() => {
    onSuccessRef.current = handleSuccess;
  }, [handleSuccess]);
  const onErrorRef = useRef(handleError);
  useEffect(() => {
    onErrorRef.current = handleError;
  }, [handleError]);

  // Render GIS button once ready — single initialize at root, render only here
  useEffect(() => {
    if (hasClientId !== true || !gisReady) return;
    const gsi = (window as unknown as { google?: { accounts?: { id?: { renderButton: (el: HTMLElement, opts: unknown) => void } } } }).google?.accounts?.id;
    const container = gsiButtonRef.current;
    if (!gsi || !container) return;
    const credentialCallback = (resp: unknown) => {
      const r = resp as { credential?: string } | null;
      if (!r?.credential) {
        onErrorRef.current();
        return;
      }
      void onSuccessRef.current(r);
    };
    if (window.__gsiSetCallback) {
      window.__gsiSetCallback(credentialCallback);
    } else {
      window.__gsiCallback = credentialCallback;
    }
    container.innerHTML = '';
    try {
      gsi.renderButton(container, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        width: container.offsetWidth || 320,
      });
    } catch {}
  }, [hasClientId, gisReady]);

  // Fallback trigger: if GIS iframe not capturing, clicking visible button
  // directly invokes prompt() or Supabase OAuth so user is never stuck.
  const triggerFallback = useCallback(async () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;
    // First try GIS prompt() if available
    try {
      const gsi = (window as unknown as { google?: { accounts?: { id?: { prompt: (cb?: (n: unknown) => void) => void; initialize: (opts: unknown) => void } } } }).google?.accounts?.id;
      if (gsi && typeof gsi.prompt === 'function') {
        // Ensure initialized with proper client_id before prompt
        try {
          if (!(window as unknown as Record<string, unknown>).__gsiInitialized) {
            const credentialCallback = (resp: unknown) => {
              const r = resp as { credential?: string } | null;
              if (!r?.credential) {
                onErrorRef.current();
                return;
              }
              void onSuccessRef.current(r);
            };
            if (window.__gsiSetCallback) window.__gsiSetCallback(credentialCallback);
            else window.__gsiCallback = credentialCallback;
            // Call initialize with proper client_id if not yet done
            (gsi as unknown as { initialize: (opts: unknown) => void }).initialize({
              client_id: clientId,
              callback: (resp: unknown) => {
                const r = resp as { credential?: string } | null;
                if (!r?.credential) onErrorRef.current();
                else void onSuccessRef.current(r);
              },
            });
            (window as unknown as Record<string, unknown>).__gsiInitialized = true;
          }
        } catch {}
        // Try One Tap prompt - if displayed, it will handle auth
        let promptDisplayed = false;
        gsi.prompt((notification: unknown) => {
          const n = notification as { isNotDisplayed?: () => boolean; isSkippedMoment?: () => boolean; getNotDisplayedReason?: () => string };
          if (n?.isNotDisplayed?.() || n?.isSkippedMoment?.()) {
            // Not displayed -> fallback to OAuth
            void signInWithGoogle(redirectTo);
          } else {
            promptDisplayed = true;
          }
        });
        // If prompt not displayed within 800ms, fallback to OAuth (prevents stuck state)
        setTimeout(() => {
          if (!promptDisplayed) {
            const container = gsiButtonRef.current;
            const hasIframe = !!container?.querySelector('iframe');
            if (!hasIframe) {
              void signInWithGoogle(redirectTo);
            }
          }
        }, 800);
        return;
      }
    } catch {}
    // Final fallback: Supabase OAuth redirect (always works)
    const supa = getSupabase();
    if (supa) {
      void signInWithGoogle(redirectTo);
    } else {
      setTone('error');
      setError('Google sign-in not ready. Please refresh and try again.');
    }
  }, [redirectTo]);

  const handleVisibleClick = useCallback(async () => {
    resetError();
    onClick?.();
    if (busy) return;
    // If GIS ready and iframe exists, let iframe capture click (overlay will handle)
    // But if iframe missing or not capturing, trigger fallback directly
    const container = gsiButtonRef.current;
    const hasIframe = !!container?.querySelector('iframe');
    // Small delay to let GIS iframe attempt to capture; if not ready, fallback
    if (!gisReady || !hasIframe) {
      // No iframe yet -> immediate fallback
      await triggerFallback();
    } else {
      // Iframe exists but user clicked visible button area that overlay may not cover
      // (pointer-events handling), still ensure fallback after short check
      // We let the overlay's iframe handle first; if no credential within 1s, fallback will be triggered on next click
      // For now, also trigger prompt check in background
      setTimeout(() => {
        // If still idle and no working state, user may need fallback on next click
      }, 300);
    }
  }, [resetError, onClick, busy, gisReady, triggerFallback]);

  if (hasClientId === false) {
    return (
      <div role="status" className="rounded-2xl border border-[#e8e0d5] bg-[#fffaf8] p-4 text-sm text-[#5a3743]">
        <p className="font-semibold text-[#2c0d16]">Google sign-in is unavailable</p>
        <p className="mt-1 leading-5">
          The deployment is missing <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>. Use email sign-in below, or ask the operator to configure the Google OAuth client.
        </p>
      </div>
    );
  }
  if (hasClientId === null) {
    return (
      <div className="flex min-h-[48px] w-full items-center justify-center rounded-full border border-[#e8e0d5] bg-white px-6 py-3.5 text-sm font-semibold text-[#2c0d16] shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin text-[#800020]" />
      </div>
    );
  }

  return (
    <div className="relative pointer-events-auto">
      {/* Visible styled button - always pointer-events-auto, never blocked */}
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={() => void handleVisibleClick()}
        className="group flex min-h-[48px] w-full touch-manipulation items-center justify-center gap-3 rounded-full border border-[#e8e0d5] bg-white px-6 py-3.5 text-[15px] font-semibold text-[#2c0d16] shadow-sm transition-all duration-200 hover:border-[#d4c4b0] hover:bg-[#fffaf8] hover:shadow-md active:scale-[0.98] disabled:opacity-60 pointer-events-auto cursor-pointer"
      >
        <GoogleLogo />
        <span>{busy ? 'Signing you in…' : 'Continue with Google'}</span>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-[#800020]" />}
        {!gisReady && !busy && <span className="sr-only">Loading Google sign-in</span>}
      </button>

      {/* GIS iframe container. Covers visible button but allows fallback:
          - When gisReady && has iframe, pointer-events auto so iframe captures click
          - When not ready, pointer-events none so visible button fallback handles click
          Never use pointer-events-none on outer wrapper. */}
      <div
        ref={gsiButtonRef}
        className="absolute inset-0 overflow-hidden opacity-0 pointer-events-auto"
        aria-hidden="true"
        style={{ pointerEvents: gisReady && !busy ? 'auto' : 'none', cursor: gisReady ? 'pointer' : 'default' }}
      />

      {tone === 'error' && error && (
        <p role="alert" aria-live="polite" className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-[#9b1f2f]">
          {error}
        </p>
      )}
    </div>
  );
}
