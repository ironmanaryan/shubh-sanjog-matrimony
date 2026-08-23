'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ArrowRight, KeyRound } from 'lucide-react';
import OtpInput from '@/components/auth/OtpInput';
import Button from '@/components/ui/button';
import GlassCard from '@/components/ui/glass-card';
import Loader from '@/components/ui/loader';
import TextField from '@/components/ui/text-field';
import { sendOtp, verifyOtp, getSession } from '@/lib/auth-client';

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

  // OTP registration reuses the same passwordless auth API — the account is
  // created or retrieved on verify (scope PDF §4).
  const identifier = form.phone.trim() || form.email.trim();

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
    const phone = form.phone.trim();
    const email = form.email.trim();

    if (!phone && !email) {
      next.phone = 'Provide a mobile number or an email.';
      next.email = 'Provide a mobile number or an email.';
    } else {
      if (phone && !/^[+]?[\d\s-]{10,15}$/.test(phone)) {
        next.phone = 'Enter a valid mobile number.';
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        next.email = 'Enter a valid email address.';
      }
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
          ? `OTP sent to ${identifier}. Your code: ${result.demoOtp}${result.offline ? ' (offline mode)' : ''}`
          : `OTP sent successfully to ${identifier}.`,
        'success'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (code: string) => {
    if (otpCompleteRef.current) return;

    if (!form.fullName.trim()) {
      notify('Please add your full name so we can personalise your profile.', 'error');
      return;
    }

    if (code.length !== 6) {
      notify('Please enter the full 6-digit OTP to complete registration.', 'error');
      return;
    }

    otpCompleteRef.current = true;
    setBusy(true);
    try {
      const result = await verifyOtp(identifier, code);
      if (!result.ok) {
        otpCompleteRef.current = false;
        notify(result.error, 'error');
        return;
      }

      // Merge the server-issued session (real user id) with the registration name.
      const { user } = getSession();
      localStorage.setItem(
        'shubhSanjogUser',
        JSON.stringify({
          ...(user ?? { id: identifier, identifier, role: result.role }),
          identifier,
          fullName: form.fullName.trim(),
        })
      );

      router.push('/customer/biodata'); // new customers complete their matrimonial profile first
    } catch {
      otpCompleteRef.current = false;
      notify('Registration failed. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center overflow-hidden px-4 py-12 sm:px-6 lg:px-8">
      {/* Royal silk backdrop with warm gold glows */}
      <div aria-hidden="true" className="absolute inset-0 bg-royal-silk" />
      <div aria-hidden="true" className="absolute -right-24 top-16 h-72 w-72 rounded-full bg-luxe-gold/25 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-28 left-0 h-80 w-80 rounded-full bg-luxe-gold-deep/20 blur-3xl" />

      <GlassCard className="relative mx-auto w-full max-w-3xl p-6 sm:p-10">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-luxe-gold/60 bg-white/70 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-royal shadow-luxe-sm backdrop-blur-sm">
            Registration
          </div>
          <h1 className="mt-4 text-4xl text-[#2c0d16]">Create your profile</h1>
          <p className="mx-auto mt-2.5 max-w-md text-sm leading-6 text-[#5a3743]">
            Register with your mobile number or email and verify via a one-time code — it takes less than a minute.
          </p>
        </div>

        <form
          className="grid gap-5 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!otpSent) void handleSendOtp();
            else void handleRegister(otp.join(''));
          }}
        >
          <TextField
            id="fullName"
            label="Full name"
            type="text"
            value={form.fullName}
            onChange={(event) => handleFieldChange('fullName', event.target.value)}
            placeholder="e.g., Aarav Sharma"
            error={errors.fullName}
          />
          <TextField
            id="email"
            label="Email"
            type="email"
            value={form.email}
            disabled={Boolean(form.phone.trim())}
            onChange={(event) => handleFieldChange('email', event.target.value)}
            placeholder="you@example.com"
            error={errors.email}
          />
          <div className="sm:col-span-2">
            <TextField
              id="phone"
              label="Mobile number"
              type="tel"
              value={form.phone}
              disabled={Boolean(form.email.trim())}
              onChange={(event) => handleFieldChange('phone', event.target.value)}
              placeholder="+91 98765 43210"
              error={errors.phone}
              hint={!errors.phone ? "Provide either a mobile number or an email — we'll send your OTP there." : undefined}
            />
          </div>

          {!otpSent ? (
            <div className="flex flex-col gap-4 pt-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
              <Link href="/login" className="order-2 text-sm font-semibold text-[#5a3743] transition hover:text-royal sm:order-1">
                Already have an account? Login
              </Link>
              <Button type="submit" disabled={busy} className="order-1 px-7 py-3.5 sm:order-2">
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
            </div>
          ) : (
            <div className="space-y-4 pt-2 sm:col-span-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-[#4d2c36]">Enter 6-digit OTP sent to {identifier}</label>
                <OtpInput
                  idPrefix="register-otp"
                  value={otp}
                  onChange={setOtp}
                  onComplete={(code) => void handleRegister(code)}
                  disabled={busy}
                />
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtp(EMPTY_OTP);
                    otpCompleteRef.current = false;
                    notify('');
                  }}
                  className="text-sm font-semibold text-[#5a3743] transition hover:text-royal"
                >
                  Edit details
                </button>
                <Button type="submit" disabled={busy} className="px-7 py-3.5">
                  {busy ? (
                    <>
                      <Loader variant="lotus" size="sm" />
                      Verifying…
                    </>
                  ) : (
                    <>
                      Verify &amp; Register
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
              className={`rounded-xl px-3.5 py-2.5 text-sm font-medium sm:col-span-2 ${
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
        </form>
      </GlassCard>
    </div>
  );
}
