import type { Metadata } from 'next';
import { Amaranth, Inter } from 'next/font/google';
import './globals.css';
import PublicLayout from '@/components/layout/public-layout';

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
        <PublicLayout>{children}</PublicLayout>
      </body>
    </html>
  );
}
