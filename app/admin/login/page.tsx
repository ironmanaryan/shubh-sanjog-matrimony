'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import AdminLoginForm from '@/components/admin/AdminLoginForm';
import DemoModeBanner, { DEFAULT_DEMO_CREDENTIALS } from '@/components/admin/DemoModeBanner';

/**
 * /admin/login — standalone admin sign-in.
 *
 * Layout follows the reference (single card, demo banner with Fill →, Email +
 * Password fields, single primary button, subtext below). Shubh Sanjog brand
 * theme replaces the reference's navy/blue palette: maroon primary, gold
 * accent, cream page background.
 *
 * Auto-submit (one-click demo entry) is gated by TWO conditions:
 *   1. The deploy build was created with NODE_ENV !== 'production' (i.e. dev
 *      or preview deploy, never the production alias).
 *   2. The NEXT_PUBLIC_ALLOW_DEMO_AUTO_LOGIN env var is set to "1" on the
 *      deploy at build time.
 *
 * Production NEVER auto-submits because #1 fails (NODE_ENV is "production"
 * on the Vercel production alias). If the operator wants 1-click behavior on
 * a preview deploy they can set the flag in Vercel → Settings → Env Vars →
 * Preview.
 */

type DemoConfig = {
  enabled: boolean;
  reason?: string;
};

function computeDemoAutoSubmitConfig(): DemoConfig {
  // process.env is replaced at build time. NEXT_PUBLIC_ vars are inlined into
  // the client bundle, which is exactly what we want here (the gate must be
  // decided client-side, because the production deployment must not have it).
  const flag = String(process.env.NEXT_PUBLIC_ALLOW_DEMO_AUTO_LOGIN ?? '').toLowerCase();
  const nodeEnv = String(process.env.NEXT_ENV ?? process.env.NODE_ENV ?? '').toLowerCase();
  if (nodeEnv === 'production' || nodeEnv === 'prod') {
    return { enabled: false, reason: 'production deployment — auto-submit off' };
  }
  if (flag !== '1' && flag !== 'true' && flag !== 'yes') {
    return { enabled: false, reason: 'env flag NEXT_PUBLIC_ALLOW_DEMO_AUTO_LOGIN not set' };
  }
  return { enabled: true };
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [prefill, setPrefill] = useState<{ identifier: string; password: string; nonce: number } | null>(
    null
  );
  const [autoSubmitNonce, setAutoSubmitNonce] = useState<number | null>(null);

  const demoConfig = useMemo(() => computeDemoAutoSubmitConfig(), []);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/admin/setup', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (!json?.exists) {
          router.replace('/admin/setup');
          return;
        }
        setChecking(false);
      })
      .catch(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleFill = (creds: { identifier: string; password: string }) => {
    const nonce = Date.now();
    setPrefill({ ...creds, nonce });
    if (demoConfig.enabled) {
      // Schedule the auto-submit on a fresh nonce so React picks it up after
      // the prefill effect has populated the fields.
      setAutoSubmitNonce(nonce);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fffaf8] p-8 text-sm text-[#5a3743]">
        Checking admin setup…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fffaf8] px-4 py-12">
      <div className="w-full max-w-md rounded-[28px] border border-[#f1d7a6] bg-white p-7 shadow-soft">
        <header className="text-center">
          <Image
            src="/logo.png"
            alt="Shubh Sanjog"
            width={64}
            height={64}
            className="mx-auto h-16 w-16 rounded-full object-contain ring-1 ring-[#e5c88d]"
          />
          <h1 className="mt-4 text-2xl font-black tracking-tight text-[#2c0d16]">Admin Panel</h1>
          <p className="mt-1 text-sm text-[#5a3743]">
            Sign in to manage customers, profiles, payments and reports.
          </p>
        </header>

        <section className="mt-6">
          <DemoModeBanner
            onFill={handleFill}
            credentials={DEFAULT_DEMO_CREDENTIALS}
            autoSubmitAfterFill={demoConfig.enabled}
          />
        </section>

        <AdminLoginForm
          onSuccess={() => router.replace('/admin')}
          prefill={prefill}
          autoSubmitNonce={autoSubmitNonce}
          submitButtonLabel={demoConfig.enabled ? 'Enter admin panel' : 'Sign in'}
        />

        <p className="mt-5 text-center text-xs text-[#8a7a85]">
          Not an admin?{' '}
          <Link href="/" className="font-semibold text-[#7b102d] underline">
            Back to site
          </Link>
        </p>
      </div>
    </div>
  );
}
