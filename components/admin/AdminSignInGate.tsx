'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { KeyRound, ShieldAlert, ShieldCheck } from 'lucide-react';
import OtpInput from '@/components/auth/OtpInput';
import {
  clearSession,
  sendOtp,
  verifyOtp,
} from '@/lib/auth-client';

const EMPTY_OTP = ['', '', '', '', '', ''];
const RESEND_SECONDS = 30;
// Designated owner account (granted the ADMIN role on server start — PRD §4).
// The button below only PREFILLS the identifier; sign-in still requires the
// real OTP delivered to that account.
const OWNER_IDENTIFIER = 'aryansadanshiv8@gmail.com';

// Inline admin sign-in card rendered by /admin when no valid staff session
// exists, so the panel never dead-ends behind a redirect (scope PDF §29).
// Staff sign in with the shared passwordless OTP flow; customers are pointed
// back to the customer workspace instead.
export default function AdminSignInGate() {
  const [identifier, setIdentifier] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState<string[]>(EMPTY_OTP);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'info' | 'error' | 'success'>('info');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const otpCompleteRef = useRef(false);

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

  const sendOtpTo = async (raw: string) => {
    const value = raw.trim();
    if (!value) {
      notify('Please enter your staff mobile number or email.', 'error');
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
      notify(
        result.demoOtp
          ? `OTP sent to ${value}. Your code: ${result.demoOtp}`
          : `OTP sent successfully to ${value}.`,
        'success'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSendOtp = async () => {
    await sendOtpTo(identifier);
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
      if (result.role !== 'admin') {
        // Customers don't belong here — drop their session and point them home.
        clearSession();
        otpCompleteRef.current = false;
        notify('This account does not have admin access.', 'error');
        return;
      }
      // Session persisted by verifyOtp() — reload so the panel re-bootstraps
      // from storage and opens straight into the operations dashboard.
      window.location.reload();
    } catch {
      otpCompleteRef.current = false;
      notify('Sign-in failed. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fffaf8] px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md rounded-[28px] border border-[#f1d7a6] bg-white p-8 shadow-soft">
        <div className="inline-flex items-center gap-2 rounded-full bg-[#fff1dc] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#7b102d]">
          <Image
            src="/logo.png"
            alt="Shubh Sanjog Matrimony logo"
            width={48}
            height={48}
            className="h-5 w-5 rounded-full object-contain"
          />
          Shubh Sanjog
        </div>

        <h1 className="mt-4 text-2xl font-black tracking-tight text-[#2c0d16]">Admin sign in</h1>
        <p className="mt-1.5 text-sm text-[#5a3743]">
          Restricted area — staff access via one-time code.
        </p>

        <form
          className="mt-7 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!otpSent) void handleSendOtp();
            else void completeLogin(otp.join(''));
          }}
        >
          <div>
            <label htmlFor="admin-identifier" className="mb-2 block text-sm font-semibold text-[#4d2c36]">
              Mobile number or email
            </label>
            <input
              id="admin-identifier"
              type="text"
              value={identifier}
              disabled={otpSent || busy}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="admin@shubhsanjog.com"
              className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-4 py-3 text-sm text-[#2c0d16] outline-none transition placeholder:text-[#b09a92] focus:border-maroon-700 focus:ring-2 focus:ring-maroon-700/15 disabled:opacity-70"
            />
          </div>

          {!otpSent ? (
            <>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-maroon-800 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-maroon-800/25 transition hover:bg-maroon-700 active:scale-[0.99] disabled:opacity-70"
              >
                <KeyRound size={16} />
                {busy ? 'Sending…' : 'Send OTP'}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => setIdentifier(OWNER_IDENTIFIER)}
                className="w-full rounded-full border border-[#e5c88d] bg-[#fffaf0] px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-[#8a5a11] transition hover:bg-[#fff3dd] disabled:opacity-70"
              >
                <ShieldCheck size={13} className="mr-1.5 inline" />
                Use owner account ({OWNER_IDENTIFIER})
              </button>
            </>
          ) : (
            <>
              <OtpInput
                idPrefix="admin-gate-otp"
                value={otp}
                onChange={setOtp}
                onComplete={(code) => void completeLogin(code)}
                disabled={busy}
              />

              <button
                type="submit"
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-maroon-800 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-maroon-800/25 transition hover:bg-maroon-700 active:scale-[0.99] disabled:opacity-70"
              >
                {busy ? 'Verifying…' : 'Verify & continue'}
              </button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtp(EMPTY_OTP);
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
        </form>

        <div className="mt-7 flex items-start gap-2 rounded-xl bg-[#f4e9ee] px-3.5 py-3 text-xs leading-relaxed text-[#8a5a6b]">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          <span>
            Not a team member?{' '}
            <Link href="/" className="font-semibold text-maroon-700 hover:text-maroon-600">
              Back to site
            </Link>{' '}
            — customers can sign in from there.
          </span>
        </div>
      </div>
    </div>
  );
}
