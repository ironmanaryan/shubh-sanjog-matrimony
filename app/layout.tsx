import type { Metadata } from 'next';
import { Amaranth, Inter } from 'next/font/google';
import './globals.css';
import dynamic from 'next/dynamic';
import PublicLayout from '@/components/layout/public-layout';
import SessionBridge from '@/components/SessionBridge';
import { AuthProvider } from '@/components/auth/AuthProvider';

// Defer non-critical GIS provider to after hydration to reduce TBT / main-thread
// blocking on first paint. `lazyOnload`-equivalent via dynamic + ssr:false.
const GoogleAuthRoot = dynamic(() => import('@/components/auth/GoogleAuthRoot'), {
  ssr: false,
  loading: () => null,
});

const amaranth = Amaranth({
  weight: ['400', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-amaranth',
});

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Shubh Sanjog Matrimony',
  description: 'Professional matrimony website for meaningful family connections and matchmaking.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#800020',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${amaranth.variable} ${inter.variable}`}>
      <body>
        {/* Keeps the Express API session in sync with the Supabase session. */}
        <SessionBridge />
        {/* Wraps the tree in <GoogleOAuthProvider> when NEXT_PUBLIC_GOOGLE_CLIENT_ID
            is set; otherwise renders children unchanged so the app keeps working
            on deployments without a Google client. */}
        <GoogleAuthRoot>
          {/* Shared "who is signed in" state for the header and every page. */}
          <AuthProvider>
            <PublicLayout>{children}</PublicLayout>
          </AuthProvider>
        </GoogleAuthRoot>
      </body>
    </html>
  );
}
