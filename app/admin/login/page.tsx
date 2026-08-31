'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import AdminLoginForm from '@/components/admin/AdminLoginForm';

/**
 * /admin/login — standalone admin sign-in.
 *
 * Before rendering, it asks /api/admin/setup whether a master admin exists. If
 * not, the visitor is sent to /admin/setup so a brand-new install can create the
 * first account instead of staring at a login form that cannot succeed.
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

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
        // If the check itself fails, still show the form — the login endpoint
        // will report the real problem.
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fffaf8] p-8 text-sm text-[#5a3743]">
        Checking admin setup…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fffaf8] px-4 py-12">
      <div className="w-full max-w-md rounded-[28px] border border-[#f1d7a6] bg-white p-8 shadow-soft">
        <div className="text-center">
          <Image
            src="/logo.png"
            alt="Shubh Sanjog"
            width={56}
            height={56}
            className="mx-auto h-14 w-14 rounded-full object-contain ring-1 ring-[#e5c88d]"
          />
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#fff1dc] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#7b102d]">
            <ShieldCheck size={12} /> Admin Login
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-[#2c0d16]">Welcome back</h1>
          <p className="mt-1.5 text-sm text-[#5a3743]">Sign in with your admin username and password</p>
        </div>

        <AdminLoginForm onSuccess={() => router.replace('/admin')} />

        <p className="mt-6 text-center text-xs text-[#8a7a85]">
          Not an admin?{' '}
          <Link href="/" className="font-semibold text-[#7b102d] underline">
            Back to site
          </Link>
        </p>
      </div>
    </div>
  );
}
