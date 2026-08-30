'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ArrowRight, Mail, Phone, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import OtpInput from '@/components/auth/OtpInput';
import Button from '@/components/ui/button';
import GlassCard from '@/components/ui/glass-card';
import Loader from '@/components/ui/loader';
import TextField from '@/components/ui/text-field';
import { getSession, looksLikeEmail } from '@/lib/auth-client';
import { getSupabase } from '@/lib/supabase';
import { signInWithGoogle } from '@/lib/google-auth';

const EMPTY_OTP = ['', '', '', '', '', ''];

interface FieldErrors {
  fullName?: string;
  email?: string;
  phone?: string;
}

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function RegisterPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect') || searchParams.get('next') || '';
  const [form, setForm] = useState({ fullName: '', email: '', phone: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState<string[]>(EMPTY_OTP);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'info' | 'error' | 'success'>('info');
  const [busy, setBusy] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const otpCompleteRef = useRef(false);

  const identifier = form.email.trim().toLowerCase();

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
          // No profile yet — check if user is via Google (has avatar) vs OTP
          // For Google users with no profile, send to fill-details; for OTP users, stay on register to avoid loop
          const provider = (user.app_metadata as Record<string, unknown>)?.['provider'] as string;
          if (provider === 'google') {
            router.replace('/register/fill-details?welcome=true');
          }
        }
      } catch {}
    })();
  }, [router]);

  const handleFieldChange = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const notify = (text: string, tone: 'info' | 'error' | 'success' = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!form.fullName.trim()) next.fullName = 'Please enter your full name.';
    if (!form.email.trim()) next.email = 'Please enter your email address.';
    else if (!looksLikeEmail(form.email.trim())) next.email = 'Enter a valid email address.';
    if (form.phone.trim() && !/^[+]?[\d\s-]{10,15}$/.test(form.phone.trim())) {
      next.phone = 'Enter a valid mobile number.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleGoogleSignIn = async () => {
    setGoogleBusy(true);
    const result = await signInWithGoogle(redirectParam);
    if (!result.ok) {
      notify(result.error || 'Google sign-in failed. Please try again.', 'error');
      setGoogleBusy(false);
    }
  };

  const handleSendOtp = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        notify('Cannot reach the authentication service. Please check your connection and try again.', 'error');
        return;
      }
      const email = identifier;
      const { data, error } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: undefined,
        },
      });
      if (error) {
        notify(error.message || 'Could not send OTP. Please try again.', 'error');
        return;
      }
      setOtpSent(true);
      setOtp(EMPTY_OTP);
      otpCompleteRef.current = false;
      notify('OTP sent to your email address. Please check your inbox.', 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not send OTP. Please try again.';
      notify(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (code: string) => {
    if (otpCompleteRef.current) return;
    if (!form.fullName.trim()) {
      notify('Please add your full name.', 'error');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      notify('Please enter the complete 6-digit code.', 'error');
      return;
    }

    otpCompleteRef.current = true;
    setBusy(true);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        otpCompleteRef.current = false;
        notify('Cannot reach the authentication service. Please check your connection and try again.', 'error');
        return;
      }
      const email = identifier;
      const otpInput = code.trim();
      const { data, error } = await supabase.auth.verifyOtp({
        email: email,
        token: otpInput,
        type: 'email',
      });
      if (error) {
        otpCompleteRef.current = false;
        notify(error.message || 'Invalid or expired OTP. Please request a new code.', 'error');
        return;
      }
      if (!data?.session || !data?.user) {
        otpCompleteRef.current = false;
        notify('Invalid or expired OTP. Please request a new code.', 'error');
        return;
      }
      try {
        localStorage.setItem('token', data.session.access_token);
        localStorage.setItem(
          'shubhSanjogUser',
          JSON.stringify({
            id: data.user.id,
            identifier: email,
            role: (data.user.app_metadata?.role as string) || 'customer',
            fullName: form.fullName.trim(),
          })
        );
        if (form.phone.trim()) {
          try {
            localStorage.setItem('pendingPhone', form.phone.trim());
          } catch {}
        }
      } catch {}
      if (redirectParam) {
        router.push(redirectParam);
      } else {
        router.push('/customer/biodata');
      }
    } catch (e) {
      otpCompleteRef.current = false;
      const msg = e instanceof Error ? e.message : 'Registration failed. Please try again.';
      notify(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center bg-[#f8f5f0] px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      {/* Subtle background */}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#fffaf8] via-[#fffaf8] to-[#f8f5f0]" />

      <div className="relative w-full max-w-[440px]">
        {/* Jeevansathi-style centered card */}
        <div className="overflow-hidden rounded-[20px] border border-[#e8e0d5] bg-white shadow-[0_8px_32px_rgba(0,0,0,0.08)] sm:rounded-[24px]">
          {/* Header — official Shubh Sanjog logo */}
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

          {/* Action options — Jeevansathi pill buttons */}
          <div className="px-5 pb-6 sm:px-8 sm:pb-8">
            <div className="space-y-3">
              {/* Primary: Continue with Google */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleBusy || busy}
                className="group flex min-h-[48px] w-full touch-manipulation items-center justify-center gap-3 rounded-full border border-[#e8e0d5] bg-white px-6 py-3.5 text-[15px] font-semibold text-[#2c0d16] shadow-sm transition-all duration-200 hover:border-[#d4c4b0] hover:bg-[#fffaf8] hover:shadow-md active:scale-[0.98] disabled:opacity-60"
              >
                <GoogleLogo />
                <span>{googleBusy ? 'Redirecting to Google...' : 'Continue with Google'}</span>
              </button>

              {/* Secondary: Continue with Email — toggles form */}
              <button
                type="button"
                onClick={() => setShowEmailForm((v) => !v)}
                className="flex min-h-[48px] w-full touch-manipulation items-center justify-center gap-3 rounded-full border-2 border-royal bg-white px-6 py-3.5 text-[15px] font-semibold text-royal shadow-sm transition-all duration-200 hover:bg-royal/[0.04] active:scale-[0.98]"
              >
                <Mail size={18} className="text-royal" />
                <span>Continue with Email</span>
                {showEmailForm ? <ChevronUp size={16} className="ml-1 opacity-60" /> : <ChevronDown size={16} className="ml-1 opacity-60" />}
              </button>

              {/* Accent: Continue with Mobile Number — placeholder */}
              <button
                type="button"
                onClick={() => notify('Mobile login coming soon. Please use Email or Google.', 'info')}
                className="flex min-h-[48px] w-full touch-manipulation items-center justify-center gap-3 rounded-full bg-royal px-6 py-3.5 text-[15px] font-semibold text-white shadow-md transition-all duration-200 hover:bg-royal-deep hover:shadow-lg active:scale-[0.98]"
              >
                <Phone size={18} />
                <span>Continue with Mobile Number</span>
              </button>
            </div>

            {/* Divider */}
            <div className="relative my-6 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#f0e6d6]" />
              </div>
              <span className="relative bg-white px-3 text-xs font-medium uppercase tracking-widest text-[#a08a76]">Or</span>
            </div>

            {/* Expanded Email Form — toggled by Secondary button */}
            {showEmailForm && (
              <div className="animate-fade-up rounded-2xl border border-[#f0e6d6] bg-[#fffaf8] p-4 sm:p-5">
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!otpSent) void handleSendOtp();
                    else void handleRegister(otp.join(''));
                  }}
                  noValidate
                >
                  <div className="grid gap-4">
                    <TextField
                      id="fullName"
                      label="Full name"
                      type="text"
                      autoComplete="name"
                      value={form.fullName}
                      onChange={(event) => handleFieldChange('fullName', event.target.value)}
                      placeholder="Aarav Sharma"
                      error={errors.fullName}
                    />
                    <TextField
                      id="email"
                      label="Email address"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(event) => handleFieldChange('email', event.target.value)}
                      placeholder="you@example.com"
                      error={errors.email}
                    />
                    <TextField
                      id="phone"
                      label="Mobile (optional)"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(event) => handleFieldChange('phone', event.target.value)}
                      placeholder="+91 98765 43210"
                      error={errors.phone}
                      hint={!errors.phone ? 'For family contact & WhatsApp updates.' : undefined}
                    />
                  </div>

                  {!otpSent ? (
                    <Button
                      type="submit"
                      disabled={busy}
                      className="min-h-[48px] w-full touch-manipulation py-3.5 text-[15px] active:scale-[0.98]"
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
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-[#4d2c36]">Enter 6-digit code sent to {identifier}</label>
                        <OtpInput
                          idPrefix="register-otp"
                          value={otp}
                          onChange={setOtp}
                          onComplete={(code) => void handleRegister(code)}
                          disabled={busy}
                        />
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          type="button"
                          onClick={() => {
                            setOtpSent(false);
                            setOtp(EMPTY_OTP);
                            otpCompleteRef.current = false;
                            notify('');
                          }}
                          className="inline-flex min-h-[44px] touch-manipulation items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-[#5a3743] transition hover:bg-royal/[0.06] hover:text-royal active:scale-[0.98]"
                        >
                          Edit details
                        </button>
                        <Button
                          type="submit"
                          disabled={busy || otp.join('').length !== 6}
                          className="min-h-[48px] w-full touch-manipulation py-3.5 text-[15px] active:scale-[0.98] sm:w-auto sm:px-8"
                        >
                          {busy ? (
                            <>
                              <Loader variant="lotus" size="sm" />
                              Verifying…
                            </>
                          ) : (
                            <>
                              Verify &amp; continue
                              <ArrowRight size={16} />
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {message && (
                    <div
                      role="status"
                      aria-live="polite"
                      className={`rounded-xl px-3.5 py-3 text-sm font-medium leading-5 ${
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
                </form>
              </div>
            )}

            {/* Footer */}
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

        {/* Trust footer */}
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
