'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheck, Mail, Lock, ArrowRight, KeyRound } from 'lucide-react';
import OtpInput from '@/components/auth/OtpInput';

const EMPTY_OTP = ['', '', '', '', '', ''];

export default function AdminForgotPasswordPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState<string[]>(EMPTY_OTP);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'error' | 'success' | 'info'>('info');

  const notify = (text: string, t: 'error' | 'success' | 'info' = 'info') => {
    setMessage(text);
    setTone(t);
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return notify('Valid email required', 'error');

    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to send OTP');

      let msg = 'OTP sent to your email. It is valid for 10 minutes.';
      if (json.devOtp) msg += ` (Dev OTP: ${json.devOtp})`;
      notify(msg, 'success');
      setStep(2);
      setOtp(EMPTY_OTP);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to send OTP', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join('');
    if (!/^\d{6}$/.test(code)) return notify('Enter 6-digit OTP', 'error');
    if (newPassword.length < 8) return notify('Password must be at least 8 characters', 'error');
    if (newPassword !== confirmPassword) return notify('Passwords do not match', 'error');

    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp: code, newPassword }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Reset failed');
      notify('Password reset successful! Redirecting to login...', 'success');
      setTimeout(() => (window.location.href = '/admin/login'), 1500);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Reset failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fffaf8] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-[28px] border border-[#f1d7a6] bg-white p-8 shadow-soft">
        <div className="text-center">
          <Image src="/logo.png" alt="Shubh Sanjog" width={56} height={56} className="mx-auto h-14 w-14 rounded-full object-contain ring-1 ring-[#e5c88d]" />
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#fff1dc] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#7b102d]">
            <KeyRound size={12} /> Forgot Password
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-[#2c0d16]">Reset Admin Password</h1>
          <p className="mt-1.5 text-sm text-[#5a3743]">
            {step === 1 ? 'Enter your admin email to receive a 6-digit OTP' : `Enter the OTP sent to ${email} and your new password`}
          </p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleSendOtp} className="mt-7 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">Admin Email</label>
              <div className="relative">
                <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#b09a92]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="machinesmarvis@gmail.com"
                  className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] py-3 pl-10 pr-4 text-sm outline-none focus:border-[#7b102d] focus:ring-2 focus:ring-[#7b102d]/15"
                  autoComplete="email"
                />
              </div>
            </div>

            {message && (
              <div className={`rounded-xl px-3.5 py-2.5 text-sm font-medium ${tone === 'error' ? 'border border-red-200 bg-red-50 text-[#9b1f2f]' : tone === 'success' ? 'border border-emerald-200 bg-emerald-50 text-[#0a7d4c]' : 'border border-[#f2d9a8] bg-[#fffaf3] text-[#5a3743]'}`}>
                {message}
              </div>
            )}

            <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#7b102d] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#7b102d]/20 hover:bg-[#68001a] disabled:opacity-60">
              {busy ? 'Sending...' : 'Send OTP'} <Mail size={16} />
            </button>

            <p className="text-center text-xs text-[#8a7a85]">
              Remembered? <Link href="/admin/login" className="font-semibold text-[#7b102d] underline">Back to login</Link>
            </p>
          </form>
        ) : (
          <form onSubmit={handleReset} className="mt-7 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">6-digit OTP</label>
              <OtpInput idPrefix="admin-forgot-otp" value={otp} onChange={setOtp} onComplete={(code) => setOtp(code.split(''))} />
              <p className="mt-1 text-xs text-[#8a7a85]">Sent to {email} via machinesmarvis@gmail.com (valid 10 min)</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">New Password</label>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#b09a92]" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (min 8 chars)"
                  className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] py-3 pl-10 pr-4 text-sm outline-none focus:border-[#7b102d] focus:ring-2 focus:ring-[#7b102d]/15"
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">Confirm New Password</label>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#b09a92]" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] py-3 pl-10 pr-4 text-sm outline-none focus:border-[#7b102d] focus:ring-2 focus:ring-[#7b102d]/15"
                  autoComplete="new-password"
                />
              </div>
            </div>

            {message && (
              <div className={`rounded-xl px-3.5 py-2.5 text-sm font-medium ${tone === 'error' ? 'border border-red-200 bg-red-50 text-[#9b1f2f]' : tone === 'success' ? 'border border-emerald-200 bg-emerald-50 text-[#0a7d4c]' : 'border border-[#f2d9a8] bg-[#fffaf3] text-[#5a3743]'}`}>
                {message}
              </div>
            )}

            <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#7b102d] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#7b102d]/20 hover:bg-[#68001a] disabled:opacity-60">
              {busy ? 'Resetting...' : 'Reset Password'} <ShieldCheck size={16} />
            </button>

            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={() => { setStep(1); setMessage(''); }} className="font-semibold text-[#5a3743] hover:text-[#7b102d]">
                Back
              </button>
              <button type="button" onClick={(e) => handleSendOtp(e as unknown as React.FormEvent)} disabled={busy} className="font-semibold text-[#7b102d] hover:text-[#68001a] disabled:opacity-60">
                Resend OTP
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 text-center text-xs text-[#8a7a85]">
          <Link href="/admin/login" className="font-semibold text-[#7b102d] underline">Back to Admin Login</Link> • <Link href="/" className="font-semibold text-[#7b102d] underline">Home</Link>
        </div>
      </div>
    </div>
  );
}
