'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import GoogleLoginButton from '@/components/auth/GoogleLoginButton';
import { getSupabase } from '@/lib/supabase';

function RegisterPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect') || searchParams.get('next') || '';
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'info' | 'error' | 'success'>('info');

  useEffect(() => {
    (async () => {
      const supabase = getSupabase();
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      try {
        const { data: profile } = await supabase.from('profiles').select('is_completed').eq('id', user.id).maybeSingle();
        if (profile?.is_completed) {
          router.replace('/customer');
        } else if (profile && profile.is_completed === false) {
          router.replace('/register/fill-details?welcome=true');
        } else if (!profile) {
          const provider = (user.app_metadata as Record<string, unknown>)?.['provider'] as string;
          if (provider === 'google') {
            router.replace('/register/fill-details?welcome=true');
          }
        }
      } catch {}
    })();
  }, [router]);

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center bg-[#f8f5f0] px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#fffaf8] via-[#fffaf8] to-[#f8f5f0]" />

      <div className="relative z-10 w-full max-w-[440px] pointer-events-auto">
        <div className="overflow-hidden rounded-[20px] border border-[#e8e0d5] bg-white shadow-[0_8px_32px_rgba(0,0,0,0.08)] sm:rounded-[24px] pointer-events-auto">
          <div className="px-6 pt-8 pb-6 text-center sm:px-8 sm:pt-10">
            <Image
              src="/logo.png"
              alt="Shubh Sanjog Matrimony Logo"
              width={80}
              height={80}
              priority
              className="w-20 h-20 mx-auto object-contain mb-3"
            />
            <h1 className="font-display text-[22px] font-bold tracking-tight text-[#2c0d16] sm:text-2xl">Create your account</h1>
            <p className="mx-auto mt-1.5 max-w-[320px] text-sm leading-5 text-[#6b5a64]">Join Shubh Sanjog Matrimony — find your perfect match</p>
          </div>

          <div className="px-5 pb-6 sm:px-8 sm:pb-8">
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="w-full">
                <GoogleLoginButton redirectTo={redirectParam || '/customer'} />
              </div>

              {message && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`w-full rounded-xl px-3.5 py-3 text-sm font-medium leading-5 ${
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
            </div>

            <p className="mt-6 text-center text-xs leading-5 text-[#8a7a85]">
              By continuing, you agree to our{' '}
              <Link href="/terms" className="font-semibold text-royal underline-offset-4 hover:underline">
                Terms
              </Link>{' '}
              &{' '}
              <Link href="/privacy" className="font-semibold text-royal underline-offset-4 hover:underline">
                Privacy Policy
              </Link>
            </p>

            <p className="mt-4 text-center text-sm text-[#6b5a64]">
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-royal underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-[#a08a76] sm:mt-6">
          <ShieldCheck size={12} className="mr-1 inline text-luxe-gold-deep" />
          Trusted by 4,50,000+ families
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] flex items-center justify-center bg-[#f8f5f0] p-8 text-[#2c0d16]">Loading...</div>}>
      <RegisterPageInner />
    </Suspense>
  );
}
