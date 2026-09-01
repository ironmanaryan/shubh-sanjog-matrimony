'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import GoogleLoginButton from '@/components/auth/GoogleLoginButton';
import GlassCard from '@/components/ui/glass-card';

function LoginPageInner() {
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect') || searchParams.get('next') || '';
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'info' | 'error' | 'success'>('info');

  useEffect(() => {
    const failure = searchParams.get('error');
    if (!failure) return;
    const detail = searchParams.get('detail');
    if (failure === 'config') {
      setMessage(detail || 'Sign-in is not configured on this deployment. Please contact support.');
      setMessageTone('error');
      return;
    }
    setMessage(detail || 'Sign-in could not be completed. Please try again.');
    setMessageTone('error');
  }, [searchParams]);

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#fffaf8] px-4 py-6 sm:px-6 sm:py-12 lg:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-royal-silk opacity-60 sm:opacity-100" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-20 top-10 h-64 w-64 rounded-full bg-luxe-gold/20 blur-3xl sm:h-72 sm:w-72 sm:bg-luxe-gold/25" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 right-0 h-64 w-64 rounded-full bg-luxe-gold-deep/15 blur-3xl sm:h-80 sm:w-80 sm:bg-luxe-gold-deep/20" />

      <GlassCard className="relative z-10 mx-auto w-full max-w-5xl overflow-hidden !rounded-[24px] p-0 shadow-soft sm:!rounded-[32px] pointer-events-auto">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
          {/* Brand panel */}
          <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-royal via-royal-deep to-[#3F0010] p-8 text-white lg:flex lg:p-10">
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gold-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-gold-500/10 blur-3xl" />

            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-gold-200 backdrop-blur-sm">
              <ShieldCheck size={14} className="text-gold-300" />
              Shubh Sanjog
            </div>

            <div>
              <h1 className="max-w-sm font-display text-3xl font-bold leading-tight tracking-tight lg:text-4xl">
                Welcome back.
              </h1>
              <p className="mt-3 max-w-md text-sm leading-6 text-white/80 lg:mt-4 lg:text-base lg:leading-7">
                One-click secure sign in with Google — fast, secure, no passwords to remember.
              </p>
            </div>

            <ul className="space-y-2.5 text-sm text-white/75">
              <li className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-300" /> One-click Google Sign-In
              </li>
              <li className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-300" /> Secure & Private
              </li>
              <li className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-300" /> Instant Access
              </li>
            </ul>
          </div>

          {/* Form panel */}
          <div className="flex flex-col justify-center p-5 sm:p-8 lg:p-10">
            <div className="mb-8 text-center lg:text-left">
              <h2 className="font-display text-2xl font-bold tracking-tight text-[#2c0d16] sm:text-3xl">Sign in</h2>
              <p className="mt-1.5 text-sm leading-5 text-[#5a3743] sm:text-[15px]">One-click secure sign in with Google</p>
            </div>

            <div className="flex flex-col items-center justify-center gap-4">
              <div className="w-full max-w-sm">
                <GoogleLoginButton redirectTo={redirectParam || '/customer'} />
              </div>

              {message && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`w-full max-w-sm rounded-xl px-3.5 py-3 text-sm font-medium leading-5 sm:py-2.5 ${
                    messageTone === 'error'
                      ? 'border border-red-200 bg-red-50 text-[#9b1f2f]'
                      : messageTone === 'success'
                        ? 'border border-emerald-200 bg-emerald-50 text-[#0a7d4c]'
                        : 'border border-[#e8d9c3] bg-[#fffaf1] text-[#5a3743]'
                  }`}
                >
                  {message}
                </div>
              )}

              <p className="pt-2 text-center text-sm leading-5 text-[#5a3743]">
                Don&apos;t have an account?{' '}
                <Link href="/register" className="inline-flex min-h-[44px] items-center font-semibold text-royal underline-offset-4 hover:underline sm:min-h-0">
                  Create account
                </Link>
              </p>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] flex items-center justify-center bg-[#fffaf8] p-8 text-[#2c0d16]">Loading...</div>}>
      <LoginPageInner />
    </Suspense>
  );
}
