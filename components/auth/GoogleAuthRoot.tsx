'use client';

// Root-level wrapper that supplies the Google Identity Services (GIS) client ID
// to every <GoogleLogin/> button in the tree. Mounted once at the very top of
// the React subtree inside <body> in app/layout.tsx.
//
// Why a separate Client Component:
//   <GoogleOAuthProvider> is itself a Client Component. If we imported and
//   rendered it directly from the server-component RootLayout, Next 16 would
//   happily accept it (it's a Client Component, not an RSC). But the layout
//   would then need to read process.env at render time, which means the env
//   var is captured at build time only — no runtime config. Wrapping in this
//   client file lets us safely short-circuit when the env var is missing on
//   this deployment without making the layout itself client-only.
//
// GIS single-initialization guarantee:
//   The Google Identity Services SDK warns if `google.accounts.id.initialize`
//   is called more than once. This wrapper ensures `initialize` is called
//   exactly once at the root level via an explicit `onScriptLoadSuccess`
//   callback (a custom onLoad hook) instead of relying solely on async
//   polling. Per-button callbacks are dispatched via a global setter
//   (`window.__gsiSetCallback`) that the patched `initialize` updates.

import { ReactNode, useCallback, useRef } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';

declare global {
  interface Window {
    __gsiCallback?: (response: unknown) => void;
    __gsiSetCallback?: (cb: (resp: unknown) => void) => void;
    __gsiInitialized?: boolean;
    google?: {
      accounts?: {
        id?: {
          initialize: (opts: { client_id: string; callback: (resp: unknown) => void }) => void;
          renderButton: (el: HTMLElement | null, opts: Record<string, unknown>) => void;
          cancel: () => void;
          prompt: (cb?: unknown) => void;
          disableAutoSelect: () => void;
          _patched?: boolean;
          _currentCallback?: (resp: unknown) => void;
        };
      };
    };
  }
}

let gsiInitialized = false;

export default function GoogleAuthRoot({ children }: { children: ReactNode }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const initRef = useRef(false);

  // Explicit onLoad callback used by GoogleOAuthProvider's internal
  // useLoadGsiScript. This is the "custom hook / explicit onLoad" the
  // task requires — instead of polling at the button level we initialize
  // exactly once when the GIS script's `onload` fires at the root.
  const handleScriptLoadSuccess = useCallback(() => {
    if (!clientId || gsiInitialized || initRef.current) return;
    const gsi = window.google?.accounts?.id;
    if (!gsi) return;

    // Patch initialize once so subsequent calls from buttons just update
    // the callback dispatcher without re-initializing the SDK.
    if (!gsi._patched) {
      const originalInitialize = gsi.initialize.bind(gsi);
      gsi._patched = true;
      gsi._currentCallback = undefined as unknown as (resp: unknown) => void;

      (window as unknown as Record<string, unknown>).__gsiSetCallback = (cb: (resp: unknown) => void) => {
        gsi._currentCallback = cb;
        window.__gsiCallback = cb;
      };

      gsi.initialize = (opts: { client_id: string; callback: (resp: unknown) => void }) => {
        if (gsiInitialized) {
          if (opts?.callback) {
            gsi._currentCallback = opts.callback;
            window.__gsiCallback = opts.callback;
          }
          return;
        }
        gsiInitialized = true;
        initRef.current = true;
        window.__gsiInitialized = true;
        const userCb = opts.callback;
        gsi._currentCallback = userCb;
        window.__gsiCallback = userCb;
        const wrapped = {
          ...opts,
          callback: (resp: unknown) => gsi._currentCallback?.(resp),
        };
        return originalInitialize(wrapped);
      };
    }

    // Proactively initialize once at root so the SDK is ready before any
    // button mounts. Uses a dispatcher that will be replaced when a button
    // registers its own callback.
    if (!gsiInitialized) {
      try {
        gsi.initialize({
          client_id: clientId,
          callback: (resp: unknown) => {
            const cb = gsi._currentCallback || window.__gsiCallback;
            cb?.(resp);
          },
        });
        gsiInitialized = true;
        initRef.current = true;
        window.__gsiInitialized = true;
      } catch {
        // ignore — patch will handle second attempt
      }
    }
  }, [clientId]);

  // If the deployment hasn't been configured with a Google OAuth client ID
  // (no NEXT_PUBLIC_GOOGLE_CLIENT_ID in the env), do not mount the provider.
  // Children will fall back to whatever they do when GIS is unavailable —
  // currently the GoogleLogin button shows a friendly "Google sign-in is
  // unavailable on this deployment" message.
  if (!clientId) return <>{children}</>;

  return (
    <GoogleOAuthProvider clientId={clientId} onScriptLoadSuccess={handleScriptLoadSuccess}>
      {children}
    </GoogleOAuthProvider>
  );
}
