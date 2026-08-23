'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';
import OtpInput from '@/components/auth/OtpInput';
import Button from '@/components/ui/button';
import GlassCard from '@/components/ui/glass-card';
import Loader from '@/components/ui/loader';
import TextField from '@/components/ui/text-field';
import { sendOtp, verifyOtp, getSession, isDev, DEV_MASTER_OTP } from '@/lib/auth-client';

const EMPTY_OTP = ['', '', '', '', '', ''];
const RESEND_SECONDS = 30;

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState<string[]>(EMPTY_OTP);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'info' | 'error' | 'success'>('info');
  const [busy, setBusy] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const otpCompleteRef = useRef(false);

  // Already signed in? Route straight to the right workspace.
  useEffect(() => {
    const { token, user } = getSession();
    if (token && user) {
      router.replace(user.role === 'admin' ? '/admin' : '/customer');
    }
  }, [router]);

  // Resend cooldown ticker.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const notify = (text: string, tone: 'info' | 'error' | 'success' = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const handleSendOtp = async () => {
    const value = identifier.trim();
    if (!value) {
      notify('Please enter your mobile number or email.', 'error');
      return;
    }

    setBusy(true);
    try {
      const result = await sendOtp(value);
      if (!result.ok) {
        notify(result.error || 'Could not send OTP', 'error');
        return;
      }
      setOtpSent(true);
      setOtp(EMPTY_OTP);
      setResendIn(RESEND_SECONDS);
      otpCompleteRef.current = false;
      setOfflineMode(Boolean(result.offline));
      notify(
        result.demoOtp
          ? `OTP sent to ${value}. Your code: ${result.demoOtp}${result.offline ? ' (offline mode)' : ''}`
          : `OTP sent successfully to ${value}.`,
        'success'
      );
    } finally {
      setBusy(false);
    }
  };

  const completeLogin = async (code: string) => {
    if (otpCompleteRef.current) return;
    if (code.length !== 6) {
      notify('Please enter the full 6-digit OTP.', 'error');
      return;
    }

    otpCompleteRef.current = true;
    setBusy(true);
    try {
      const result = await verifyOtp(identifier.trim(), code);
      if (!result.ok) {
        otpCompleteRef.current = false;
        notify(result.error, 'error');
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
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center overflow-hidden px-4 py-12 sm:px-6 lg:px-8">
      {/* Royal silk backdrop with warm gold glows */}
      <div aria-hidden="true" className="absolute inset-0 bg-royal-silk" />
      <div aria-hidden="true" className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-luxe-gold/25 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-28 right-0 h-80 w-80 rounded-full bg-luxe-gold-deep/20 blur-3xl" />

      <GlassCard className="relative mx-auto w-full max-w-5xl overflow-hidden !rounded-[32px] p-0">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
          {/* Brand panel */}
          <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-royal via-royal-deep to-[#3F0010] p-10 text-white lg:flex">
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gold-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-gold-500/10 blur-3xl" />

            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-gold-200">
              <ShieldCheck size={13} />
              Shubh Sanjog
            </div>

            <div>
              <h1 className="max-w-sm text-4xl font-bold leading-tight tracking-tight">
                Welcome back.
              </h1>
              <p className="mt-4 max-w-md text-base leading-7 text-white/80">
                Log in to continue your matrimonial journey — review matches, manage preferences,
                and stay connected with your family&apos;s next chapter.
              </p>
            </div>

            <ul className="space-y-3 text-sm text-white/75">
              <li className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-gold-300" /> Passwordless OTP login
              </li>
              <li className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-gold-300" /> Verified profiles only
              </li>
              <li className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-gold-300" /> Private &amp; secure by design
              </li>
            </ul>
          </div>

          {/* Form panel */}
          <div className="p-6 sm:p-10">
            <h2 className="text-3xl font-bold tracking-tight text-[#2c0d16]">Sign in</h2>
            <p className="mt-1.5 text-sm text-[#5a3743]">
              Secure passwordless access via one-time code
            </p>

            <form
              className="mt-8 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!otpSent) void handleSendOtp();
                else void completeLogin(otp.join(''));
              }}
            >
              <TextField
                id="identifier"
                label="Mobile number or email"
                type="text"
                value={identifier}
                disabled={otpSent || busy}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="+91 98765 43210 or you@example.com"
              />

              {!otpSent ? (
                <>
                  <Button type="submit" disabled={busy} className="w-full py-3.5">
                    {busy ? (
                      <>
                        <Loader variant="lotus" size="sm" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <KeyRound size={16} />
                        Send OTP
                      </>
                    )}
                  </Button>

                  {isDev() && (
                    <p className="text-center text-xs font-medium text-[#8a7340]">
                      Development mode — any identifier works with OTP{' '}
                      <span className="rounded-md border border-gold-300/70 bg-[#fffaf0] px-1.5 py-0.5 font-mono font-bold text-maroon-700">
                        {DEV_MASTER_OTP}
                      </span>{' '}
                      · use an email containing{' '}
                      <span className="font-mono font-semibold text-maroon-700">&quot;admin&quot;</span> for admin access
                    </p>
                  )}
                </>
              ) : (
                <>
                  <OtpInput
                    idPrefix="login-otp"
                    value={otp}
                    onChange={setOtp}
                    onComplete={(code) => void completeLogin(code)}
                    disabled={busy}
                  />

                  <Button type="submit" disabled={busy} className="w-full py-3.5">
                    {busy ? (
                      <>
                        <Loader variant="lotus" size="sm" />
                        Verifying…
                      </>
                    ) : (
                      <>
                        Verify &amp; Login
                        <ArrowRight size={16} />
                      </>
                    )}
                  </Button>

                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setOtpSent(false);
                        setOtp(EMPTY_OTP);
                        setOfflineMode(false);
                        otpCompleteRef.current = false;
                        notify('');
                      }}
                      className="font-semibold text-[#5a3743] transition hover:text-maroon-700"
                    >
                      Change number / email
                    </button>
                    <button
                      type="button"
                      disabled={resendIn > 0 || busy}
                      onClick={() => void handleSendOtp()}
                      className="font-semibold text-maroon-700 transition hover:text-maroon-600 disabled:cursor-not-allowed disabled:text-[#b09a92]"
                    >
                      {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend OTP'}
                    </button>
                  </div>
                </>
              )}

              {message && (
                <div
                  role="status"
                  className={`rounded-xl px-3.5 py-2.5 text-sm font-medium ${
                    messageTone === 'error'
                      ? 'border border-red-200 bg-red-50 text-[#9b1f2f]'
                      : messageTone === 'success'
                        ? 'border border-emerald-200 bg-emerald-50 text-[#0a7d4c]'
                        : 'border border-gold-200/70 bg-[#fffaf1] text-[#5a3743]'
                  }`}
                >
                  {message}
                </div>
              )}

              {offlineMode && (
                <p className="rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-xs font-medium text-[#8a5a11]">
                  API server unreachable — running in offline demo mode. The panel will load with
                  limited live data.
                </p>
              )}

              <p className="pt-1 text-center text-sm text-[#5a3743]">
                Don&apos;t have an account?{' '}
                <Link href="/register" className="font-semibold text-maroon-700 hover:text-maroon-600">
                  Register now
                </Link>
              </p>
            </form>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
