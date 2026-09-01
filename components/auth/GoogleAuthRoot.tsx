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

import { ReactNode } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';

export default function GoogleAuthRoot({ children }: { children: ReactNode }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  // If the deployment hasn't been configured with a Google OAuth client ID
  // (no NEXT_PUBLIC_GOOGLE_CLIENT_ID in the env), do not mount the provider.
  // Children will fall back to whatever they do when GIS is unavailable —
  // currently the GoogleLogin button shows a friendly "Google sign-in is
  // unavailable on this deployment" message.
  if (!clientId) return <>{children}</>;

  return <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>;
}