'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheck } from 'lucide-react';
import AdminLoginForm from '@/components/admin/AdminLoginForm';

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
 */
export default function AdminSignInGate() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fffaf8] px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md rounded-[28px] border border-[#f1d7a6] bg-white p-8 shadow-soft">
        <div className="inline-flex items-center gap-2 rounded-full bg-[#fff1dc] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#7b102d]">
          <Image src="/logo.png" alt="Shubh Sanjog" width={48} height={48} className="h-5 w-5 rounded-full object-contain" />
          Shubh Sanjog
        </div>

        <h1 className="mt-4 text-2xl font-black tracking-tight text-[#2c0d16]">Admin sign in</h1>
        <p className="mt-1.5 text-sm text-[#5a3743]">
          Restricted area — sign in with your admin username and password.
        </p>

        <AdminLoginForm compact onSuccess={() => window.location.reload()} />

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
