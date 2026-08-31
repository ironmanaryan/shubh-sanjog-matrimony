'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheck } from 'lucide-react';
import AdminLoginForm from '@/components/admin/AdminLoginForm';
import DemoModeBanner, { DEFAULT_DEMO_CREDENTIALS } from '@/components/admin/DemoModeBanner';

/**
 * Inline admin sign-in card rendered by the admin pages when no valid session
 * exists, so the panel never dead-ends behind a bare redirect (scope PDF §29).
 *
 * This is the ONLY sign-in gate in the admin area — /admin, /admin/inquiries
 * and /admin/customers/[id] all render this component, so an admin who signs in
 * on one page is signed in on all of them. (Previously /admin used a different
 * gate from the other two, which meant signing in on one page did not unlock
 * the others.)
 *
 * Authentication is username/password against the `admin_users` table
 * (bcrypt + JWT). Email OTP is now only used for password recovery at
 * /admin/forgot-password, not as a primary login path.
 *
 * DESIGN
 * -------
 * Mirrors the standalone /admin/login page (same single-card layout, same
 * demo banner with Fill →, same submit-button copy, same subtext) so an admin
 * who lands on /admin cold gets the exact same sign-in affordance as someone
 * who navigated to /admin/login directly. The only difference is that this
 * inline card doesn't run the "/api/admin/setup" check — that runs once on
 * entry to /admin/login via the page-level redirect, while this gate is
 * rendered on every other admin page and so must not redirect.
 *
 * AUTO-SUBMIT GATING
 * ------------------
 * Identical to /admin/login: enabled only when NODE_ENV !== 'production' AND
 * the deploy build has NEXT_PUBLIC_ALLOW_DEMO_AUTO_LOGIN=1 inlined into the
 * client bundle. Production alias is always safe because NODE_ENV=production
 * fails the first check at build time. See app/admin/login/page.tsx for the
 * canonical explanation.
 */

type DemoConfig = {
  enabled: boolean;
  reason?: string;
};

function computeDemoAutoSubmitConfig(): DemoConfig {
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

export default function AdminSignInGate() {
  const demoConfig = useMemo(() => computeDemoAutoSubmitConfig(), []);
  const [prefill, setPrefill] = useState<{ identifier: string; password: string; nonce: number } | null>(
    null
  );
  const [autoSubmitNonce, setAutoSubmitNonce] = useState<number | null>(null);

  const handleFill = useCallback(
    (creds: { identifier: string; password: string }) => {
      const nonce = Date.now();
      setPrefill({ ...creds, nonce });
      if (demoConfig.enabled) {
        setAutoSubmitNonce(nonce);
      }
    },
    [demoConfig.enabled]
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fffaf8] px-4 py-12 sm:px-6 lg:px-8">
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
          onSuccess={() => window.location.reload()}
          compact
          prefill={prefill}
          autoSubmitNonce={autoSubmitNonce}
          submitButtonLabel={demoConfig.enabled ? 'Enter admin panel' : 'Sign in'}
        />

        <div className="mt-6 rounded-xl bg-[#f4e9ee] px-3.5 py-3 text-xs leading-relaxed text-[#8a5a6b]">
          <div className="flex items-center gap-2 font-bold text-[#7b102d]">
            <ShieldCheck size={14} /> Secured by Supabase + bcrypt
          </div>
          <p className="mt-1">
            Credentials live in the <code>admin_users</code> table and are verified with bcrypt. Passwords are never
            stored or returned in plain text.
          </p>
        </div>

        <div className="mt-4 text-center text-xs text-[#8a7a85]">
          Not an admin?{' '}
          <Link href="/" className="font-semibold text-[#7b102d] underline">
            Back to site
          </Link>
          <span className="mx-2 text-[#b09a92]">•</span>
          <Link href="/admin/security" className="font-semibold text-[#7b102d] underline">
            Security settings
          </Link>
        </div>
      </div>
    </div>
  );
}
