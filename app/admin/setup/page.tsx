'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ShieldCheck, User, Mail, Lock, ArrowRight } from 'lucide-react';

export default function AdminSetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [exists, setExists] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'error' | 'success' | 'info'>('info');

  useEffect(() => {
    fetch('/api/admin/setup', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.exists) setExists(true);
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  const notify = (text: string, t: 'error' | 'success' | 'info' = 'info') => {
    setMessage(text);
    setTone(t);
  };

  const MIN_USERNAME = 3;
  const MIN_PASSWORD = 8; // matches /api/admin/credentials

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim() || form.username.trim().length < MIN_USERNAME) return notify(`Username must be at least ${MIN_USERNAME} characters`, 'error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return notify('Valid email required', 'error');
    if (form.password.length < MIN_PASSWORD) return notify(`Password must be at least ${MIN_PASSWORD} characters`, 'error');
    if (form.password !== form.confirmPassword) return notify('Passwords do not match', 'error');

    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.username.trim(), email: form.email.trim().toLowerCase(), password: form.password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Setup failed');
      notify('Master admin created successfully! Redirecting to login...', 'success');
      setTimeout(() => router.replace('/admin/login'), 1200);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Setup failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return <div className="min-h-screen bg-[#fffaf8] flex items-center justify-center p-8 text-[#2c0d16]">Checking admin setup status...</div>;
  }

  if (exists) {
    return (
      <div className="min-h-screen bg-[#fffaf8] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-[28px] border border-[#f1d7a6] bg-white p-8 text-center shadow-soft">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#ffe5e5] text-[#9b1f2f]">
            <Lock size={20} />
          </div>
          <h1 className="mt-4 text-xl font-black text-[#2c0d16]">Setup already completed</h1>
          <p className="mt-2 text-sm text-[#5a3743]">A master admin already exists. Re-setup is blocked for security.</p>
          <div className="mt-6 flex flex-col gap-2">
            <Link href="/admin/login" className="inline-flex items-center justify-center rounded-full bg-[#7b102d] px-6 py-3 text-sm font-bold text-white">
              Go to Admin Login
            </Link>
            <Link href="/admin" className="text-sm font-semibold text-[#7b102d] underline">
              Back to Admin Panel
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fffaf8] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-[28px] border border-[#f1d7a6] bg-white p-8 shadow-soft">
        <div className="text-center">
          <Image src="/logo.png" alt="Shubh Sanjog" width={56} height={56} className="mx-auto h-14 w-14 rounded-full object-contain ring-1 ring-[#e5c88d]" />
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#fff1dc] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#7b102d]">
            <ShieldCheck size={12} /> Initial Setup
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-[#2c0d16]">Create Master Admin</h1>
          <p className="mt-1.5 text-sm text-[#5a3743]">This will be the first and only master admin. Choose a strong username and password.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">Username</label>
            <div className="relative">
              <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#b09a92]" />
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm((s) => ({ ...s, username: e.target.value }))}
                placeholder="shubhadmin"
                className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] py-3 pl-10 pr-4 text-sm outline-none focus:border-[#7b102d] focus:ring-2 focus:ring-[#7b102d]/15"
                autoComplete="username"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">Email</label>
            <div className="relative">
              <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#b09a92]" />
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                placeholder="machinesmarvis@gmail.com"
                className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] py-3 pl-10 pr-4 text-sm outline-none focus:border-[#7b102d] focus:ring-2 focus:ring-[#7b102d]/15"
                autoComplete="email"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">Password</label>
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#b09a92]" />
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
                placeholder={`At least ${MIN_PASSWORD} characters`}
                className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] py-3 pl-10 pr-4 text-sm outline-none focus:border-[#7b102d] focus:ring-2 focus:ring-[#7b102d]/15"
                autoComplete="new-password"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">Confirm Password</label>
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#b09a92]" />
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm((s) => ({ ...s, confirmPassword: e.target.value }))}
                placeholder="Repeat password"
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
            {busy ? 'Creating...' : 'Create Master Admin'} <ArrowRight size={16} />
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[#8a7a85]">Already have an admin? <Link href="/admin/login" className="font-semibold text-[#7b102d] underline">Sign in</Link></p>
      </div>
    </div>
  );
}
