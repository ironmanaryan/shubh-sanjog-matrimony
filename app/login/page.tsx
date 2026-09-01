'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ArrowRight, Mail, ShieldCheck } from 'lucide-react';
import OtpInput from '@/components/auth/OtpInput';
import GoogleLoginButton from '@/components/auth/GoogleLoginButton';
import Button from '@/components/ui/button';
import GlassCard from '@/components/ui/glass-card';
import Loader from '@/components/ui/loader';
import TextField from '@/components/ui/text-field';
import { verifyOtp, looksLikeEmail } from '@/lib/auth-client';
import { getSupabase } from '@/lib/supabase';

const EMPTY_OTP = ['', '', '', '', '', ''];
const RESEND_SECONDS = 30;

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect') || searchParams.get('next') || '';
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState<string[]>(EMPTY_OTP);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'info' | 'error' | 'success'>('info');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const otpCompleteRef = useRef(false);

  // Surface failures that /auth/callback bounced back to us.
  useEffect(() => {
    const failure = searchParams.get('error');
    if (!failure) return;
    const detail = searchParams.get('detail');
    if (failure === 'config') {
      notify(
        detail || 'Sign-in is not configured on this deployment. Please contact support.',
        'error'
      );
      return;
    }
    notify(
      detail || 'Sign-in could not be completed. Please try again.',
      'error'
    );
  }, [searchParams]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((v) => Math.max(0, v - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const notify = (text: string, tone: 'info' | 'error' | 'success' = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const validateEmail = (value: string): boolean => {
    if (!value.trim()) {
      setEmailError('Please enter your email address.');
      return false;
    }
    if (!looksLikeEmail(value)) {
      setEmailError('Please enter a valid email address.');
      return false;
    }
    setEmailError(undefined);
    return true;
  };

  const handleSendOtp = async () => {
    if (!validateEmail(email)) return;

    const value = email.trim().toLowerCase();
    setBusy(true);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        console.error('[supabase] Cannot reach the authentication service — Supabase client not initialized. Check NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
        notify('Cannot reach the authentication service. Please check your connection and try again.', 'error');
        return;
      }
      const { data, error } = await supabase.auth.signInWithOtp({
        email: value,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/complete`,
        },
      });
      console.error('[supabase] signInWithOtp raw error object:', error);
      console.log('[supabase] signInWithOtp raw response:', { data, error });
      if (error) {
        console.error('[supabase] signInWithOtp error JSON:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        notify(error.message || 'Could not send OTP. Please try again.', 'error');
        return;
      }
      setOtpSent(true);
      setOtp(EMPTY_OTP);
      setResendIn(RESEND_SECONDS);
      otpCompleteRef.current = false;
      notify('OTP sent to your email address. Please check your inbox.', 'success');
    } catch (e) {
      console.error('[supabase] signInWithOtp exception raw:', e);
      const msg = e instanceof Error ? e.message : 'Could not send OTP. Please try again.';
      notify(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const completeLogin = async (code: string) => {
    if (otpCompleteRef.current) return;
    if (!/^\d{6}$/.test(code)) {
      notify('Please enter the complete 6-digit code.', 'error');
      return;
    }

    otpCompleteRef.current = true;
    setBusy(true);
    try {
      const result = await verifyOtp(email.trim().toLowerCase(), code);
      if (!result.ok) {
        otpCompleteRef.current = false;
        notify(result.error, 'error');
        return;
      }
      if (redirectParam) {
        router.push(redirectParam);
        return;
      }
      router.push(result.role === 'admin' ? '/admin' : '/customer');
    } catch {
      otpCompleteRef.current = false;
      notify('Login failed. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#fffaf8] px-4 py-6 sm:px-6 sm:py-12 lg:px-8">
      {/* Background — subtle on mobile to keep fast, rich on desktop */}
      <div aria-hidden="true" className="absolute inset-0 bg-royal-silk opacity-60 sm:opacity-100" />
      <div aria-hidden="true" className="absolute -left-20 top-10 h-64 w-64 rounded-full bg-luxe-gold/20 blur-3xl sm:h-72 sm:w-72 sm:bg-luxe-gold/25" />
      <div aria-hidden="true" className="absolute -bottom-20 right-0 h-64 w-64 rounded-full bg-luxe-gold-deep/15 blur-3xl sm:h-80 sm:w-80 sm:bg-luxe-gold-deep/20" />

      <GlassCard className="relative mx-auto w-full max-w-5xl overflow-hidden !rounded-[24px] p-0 shadow-soft sm:!rounded-[32px]">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
          {/* Brand panel — hidden on mobile for speed & focus */}
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
                Sign in with your email — we&apos;ll send a 6-digit code. No passwords, no hassle.
              </p>
            </div>

            <ul className="space-y-2.5 text-sm text-white/75">
              <li className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-300" /> 6-digit Email OTP
              </li>
              <li className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-300" /> Auto account creation
              </li>
              <li className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-300" /> Private & secure
              </li>
            </ul>
          </div>

          {/* Form panel — full-bleed on mobile, padded on desktop */}
          <div className="p-5 sm:p-8 lg:p-10">
            <div className="mb-6 lg:mb-8">
              <h2 className="font-display text-2xl font-bold tracking-tight text-[#2c0d16] sm:text-3xl">Sign in</h2>
              <p className="mt-1.5 text-sm leading-5 text-[#5a3743] sm:text-[15px]">Secure 6-digit code sent to your email</p>
            </div>

            <GoogleLoginButton redirectTo={redirectParam || '/customer'} />

            <div className="relative my-6 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#f0e6d6]" />
              </div>
              <span className="relative bg-white px-3 text-xs font-medium uppercase tracking-widest text-[#a08a76]">Or continue with email</span>
            </div>

            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!otpSent) void handleSendOtp();
                else void completeLogin(otp.join(''));
              }}
              noValidate
            >
              <TextField
                id="email"
                label="Email address"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                disabled={otpSent || busy}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (emailError) setEmailError(undefined);
                }}
                placeholder="you@example.com"
                error={emailError}
                hint={!emailError && !otpSent ? 'We’ll send a 6-digit code to this email.' : undefined}
              />

              {!otpSent ? (
                <>
                  <Button
                    type="submit"
                    disabled={busy}
                    className="min-h-[48px] w-full touch-manipulation py-3.5 text-[15px] active:scale-[0.98] sm:py-4"
                  >
                    {busy ? (
                      <>
                        <Loader variant="lotus" size="sm" />
                        Sending code…
                      </>
                    ) : (
                      <>
                        <Mail size={16} />
                        Send 6-digit code
                      </>
                    )}
                  </Button>
                  <p className="text-center text-xs leading-4 text-[#8a7340] sm:text-sm">
                    New here? Code auto-creates your account.
                  </p>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="block text-sm font-semibold text-[#4d2c36]">Enter 6-digit code sent to {email}</label>
                    <OtpInput
                      idPrefix="login-otp"
                      value={otp}
                      onChange={setOtp}
                      onComplete={(code) => void completeLogin(code)}
                      disabled={busy}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={busy || otp.join('').length !== 6}
                    className="min-h-[48px] w-full touch-manipulation py-3.5 text-[15px] active:scale-[0.98] sm:py-4"
                  >
                    {busy ? (
                      <>
                        <Loader variant="lotus" size="sm" />
                        Verifying…
                      </>
                    ) : (
                      <>
                        Verify &amp; sign in
                        <ArrowRight size={16} />
                      </>
                    )}
                  </Button>

                  <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setOtpSent(false);
                        setOtp(EMPTY_OTP);
                        otpCompleteRef.current = false;
                        notify('');
                      }}
                      className="min-h-[44px] touch-manipulation rounded-full px-4 py-2 text-left font-semibold text-[#5a3743] transition active:scale-[0.98] hover:text-royal hover:bg-royal/[0.06] sm:min-h-0 sm:px-0 sm:py-0 sm:hover:bg-transparent"
                    >
                      Change email
                    </button>
                    <button
                      type="button"
                      disabled={resendIn > 0 || busy}
                      onClick={() => void handleSendOtp()}
                      className="min-h-[44px] touch-manipulation rounded-full bg-royal/5 px-4 py-2 font-semibold text-royal transition active:scale-[0.98] hover:bg-royal/10 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:bg-transparent sm:px-0 sm:py-0"
                    >
                      {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                    </button>
                  </div>
                </>
              )}

              {message && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`rounded-xl px-3.5 py-3 text-sm font-medium leading-5 sm:py-2.5 ${
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

              <p className="pt-1 text-center text-sm leading-5 text-[#5a3743]">
                Don&apos;t have an account?{' '}
                <Link href="/register" className="inline-flex min-h-[44px] items-center font-semibold text-royal underline-offset-4 hover:underline sm:min-h-0">
                  Create account
                </Link>
              </p>
            </form>
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
