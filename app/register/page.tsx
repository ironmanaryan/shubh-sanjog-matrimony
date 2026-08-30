'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ArrowRight, Mail, ShieldCheck } from 'lucide-react';
import OtpInput from '@/components/auth/OtpInput';
import Button from '@/components/ui/button';
import GlassCard from '@/components/ui/glass-card';
import Loader from '@/components/ui/loader';
import TextField from '@/components/ui/text-field';
import { sendOtp, verifyOtp, getSession, looksLikeEmail } from '@/lib/auth-client';

const EMPTY_OTP = ['', '', '', '', '', ''];

interface FieldErrors {
  fullName?: string;
  email?: string;
  phone?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState<string[]>(EMPTY_OTP);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'info' | 'error' | 'success'>('info');
  const [busy, setBusy] = useState(false);
  const otpCompleteRef = useRef(false);

  const identifier = form.email.trim().toLowerCase();

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

  const handleSendOtp = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const result = await sendOtp(identifier);
      if (!result.ok) {
        notify(result.error || 'Could not send OTP', 'error');
        return;
      }
      setOtpSent(true);
      setOtp(EMPTY_OTP);
      otpCompleteRef.current = false;
      notify(
        result.demoOtp
          ? `OTP sent to ${identifier}. Dev code: ${result.demoOtp}`
          : `6-digit code sent to ${identifier}. Check your inbox.`,
        'success'
      );
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
      const result = await verifyOtp(identifier, code, {
        fullName: form.fullName.trim(),
        email: form.email.trim() || undefined,
      });
      if (!result.ok) {
        otpCompleteRef.current = false;
        notify(result.error, 'error');
        return;
      }

      const { user } = getSession();
      try {
        localStorage.setItem(
          'shubhSanjogUser',
          JSON.stringify({
            ...(user ?? { id: identifier, identifier, role: result.role }),
            identifier,
            fullName: form.fullName.trim(),
          })
        );
      } catch {}

      router.push('/customer/biodata');
    } catch {
      otpCompleteRef.current = false;
      notify('Registration failed. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#fffaf8] px-4 py-6 sm:px-6 sm:py-12 lg:px-8">
      <div aria-hidden="true" className="absolute inset-0 bg-royal-silk opacity-60 sm:opacity-100" />
      <div aria-hidden="true" className="absolute -right-20 top-12 h-64 w-64 rounded-full bg-luxe-gold/20 blur-3xl sm:h-72 sm:w-72" />
      <div aria-hidden="true" className="absolute -bottom-20 left-0 h-64 w-64 rounded-full bg-luxe-gold-deep/15 blur-3xl sm:h-80 sm:w-80" />

      <GlassCard className="relative mx-auto w-full max-w-3xl !rounded-[24px] p-0 shadow-soft sm:!rounded-[32px]">
        <div className="p-5 sm:p-8 lg:p-10">
          <div className="mb-6 text-center sm:mb-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-luxe-gold/30 bg-white/80 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-royal shadow-sm backdrop-blur-sm">
              <ShieldCheck size={12} className="text-luxe-gold-deep" />
              Registration
            </div>
            <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-[#2c0d16] sm:mt-4 sm:text-3xl">Create your profile</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-5 text-[#5a3743] sm:text-[15px] sm:leading-6">
              6-digit Email OTP — auto-creates your account in seconds.
            </p>
          </div>

          <form
            className="space-y-4 sm:space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!otpSent) void handleSendOtp();
              else void handleRegister(otp.join(''));
            }}
            noValidate
          >
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
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
              <div className="sm:col-span-2">
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
            </div>

            {!otpSent ? (
              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <Link
                  href="/login"
                  className="order-2 inline-flex min-h-[44px] items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-[#5a3743] transition hover:bg-royal/[0.06] hover:text-royal active:scale-[0.98] sm:order-1 sm:justify-start sm:px-0 sm:py-0 sm:hover:bg-transparent"
                >
                  Already have an account? Sign in
                </Link>
                <Button
                  type="submit"
                  disabled={busy}
                  className="order-1 min-h-[48px] w-full touch-manipulation py-3.5 text-[15px] active:scale-[0.98] sm:order-2 sm:w-auto sm:px-8"
                >
                  {busy ? (
                    <>
                      <Loader variant="lotus" size="sm" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Mail size={16} />
                      Send 6-digit code
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4 pt-2">
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
                    className="inline-flex min-h-[44px] touch-manipulation items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-[#5a3743] transition hover:bg-royal/[0.06] hover:text-royal active:scale-[0.98] sm:justify-start sm:px-0 sm:py-0 sm:hover:bg-transparent"
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
          </form>
        </div>
      </GlassCard>
    </div>
  );
}
