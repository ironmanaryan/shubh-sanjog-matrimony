'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { KeyRound, Lock, User } from 'lucide-react';
import { persistAdminSession } from '@/lib/admin-session';

/**
 * Admin username/password sign-in form.
 *
 * Shared by the standalone /admin/login page and the inline sign-in card that
 * admin pages render when there is no valid session, so both behave identically
 * (same endpoint, same session storage, same copy).
 */

type Tone = 'error' | 'success' | 'info';

const TONE_CLASSES: Record<Tone, string> = {
  error: 'border border-red-200 bg-red-50 text-[#9b1f2f]',
  success: 'border border-emerald-200 bg-emerald-50 text-[#0a7d4c]',
  info: 'border border-[#f2d9a8] bg-[#fffaf3] text-[#5a3743]',
};

export default function AdminLoginForm({
  onSuccess,
  compact = false,
  prefill,
  autoSubmitNonce,
  submitButtonLabel = 'Sign in',
}: {
  /** Called after the session is stored — navigate or reload. */
  onSuccess?: () => void;
  /** Renders the tighter inline variant (no footer links inside the form). */
  compact?: boolean;
  /**
   * Imperative handle parents (the Demo banner above the page) can use to type
   * credentials into the form without re-rendering or stealing focus from the
   * user-typed values. When `prefill` changes, the form's state is updated and
   * a small "Filled from demo banner" notice is shown so the user knows.
   */
  prefill?: { identifier: string; password: string; nonce?: number } | null;
  /**
   * When the parent sets this to a fresh number AND a prefill has arrived, the
   * form auto-submits ~250ms after the fields are populated. Parent MUST gate
   * this behind an explicit env flag (see app/admin/login/page.tsx) so that
   * production is never auto-submitted.
   */
  autoSubmitNonce?: number | null;
  /** Override the submit button label. */
  submitButtonLabel?: string;
}) {
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<Tone>('info');
  const formRef = React.useRef<HTMLFormElement | null>(null);

  // React to demo-fill requests from the parent. nonce ticks on every click so
  // filling the same credentials twice still re-runs the side effect. The
  // auto-submit nonce (if set) drives a second effect that fires the actual
  // form.requestSubmit() — the parent owns the timing semantics.
  useEffect(() => {
    if (!prefill) return;
    setForm({ identifier: prefill.identifier, password: prefill.password });
    setMessage('Demo credentials filled — press Sign in to continue.');
    setTone('info');
  }, [prefill?.nonce, prefill?.identifier, prefill?.password]);

  useEffect(() => {
    if (autoSubmitNonce == null) return;
    // Don't fire while submission is already in flight, before the fields are
    // populated, or with empty fields.
    if (busy) return;
    if (!form.identifier || !form.password) return;
    const timer = setTimeout(() => {
      // requestSubmit() keeps the same validation path as a real click.
      try {
        formRef.current?.requestSubmit();
      } catch {
        /* noop — old browsers just don't auto-submit, which is fine */
      }
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmitNonce]);

  // The actual sign-in call. Pulled out so the auto-submit effect above can
  // trigger the same code path as a manual click on Sign in.
  async function performLogin(): Promise<boolean> {
    const identifier = form.identifier.trim();
    if (!identifier || !form.password) {
      setMessage('Username/email and password are required');
      setTone('error');
      return false;
    }
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: identifier, password: form.password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.token) {
        throw new Error(json?.error || 'Login failed');
      }
      persistAdminSession(json.token, {
        id: json.admin.id,
        username: json.admin.username,
        email: json.admin.email,
      });
      setMessage('Login successful — redirecting…');
      setTone('success');
      setTimeout(() => onSuccess?.(), 700);
      return true;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Login failed');
      setTone('error');
      setBusy(false);
      return false;
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await performLogin();
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="mt-5 space-y-4">
      <div>
        <label htmlFor="admin-identifier" className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">
          Email
        </label>
        <div className="relative">
          <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#b09a92]" />
          <input
            id="admin-identifier"
            type="email"
            value={form.identifier}
            onChange={(e) => setForm((s) => ({ ...s, identifier: e.target.value }))}
            placeholder="admin@demo.in"
            className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] py-3 pl-10 pr-4 text-sm outline-none focus:border-[#7b102d] focus:ring-2 focus:ring-[#7b102d]/15"
            autoComplete="username"
            disabled={busy}
          />
        </div>
      </div>

      <div>
        <label htmlFor="admin-password" className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">
          Password
        </label>
        <div className="relative">
          <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#b09a92]" />
          <input
            id="admin-password"
            type="password"
            value={form.password}
            onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
            placeholder="Your password"
            className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] py-3 pl-10 pr-4 text-sm outline-none focus:border-[#7b102d] focus:ring-2 focus:ring-[#7b102d]/15"
            autoComplete="current-password"
            disabled={busy}
          />
        </div>
      </div>

      {!compact && (
        <div className="flex items-center justify-between text-sm">
          <Link href="/admin/forgot-password" className="font-semibold text-[#7b102d] underline-offset-4 hover:underline">
            Forgot Password?
          </Link>
          <Link href="/admin/setup" className="text-xs text-[#8a7a85] hover:text-[#7b102d]">
            First-time setup
          </Link>
        </div>
      )}

      {message && (
        <div className={`rounded-xl px-3.5 py-2.5 text-sm font-medium ${TONE_CLASSES[tone]}`} role="status">
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#7b102d] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#7b102d]/20 hover:bg-[#68001a] disabled:opacity-60"
      >
        <KeyRound size={16} />
        {busy ? 'Signing in…' : submitButtonLabel}
      </button>

      <p className="text-center text-[12px] leading-relaxed text-[#8a7a85]">
        Real email/username &amp; password login activates automatically once Supabase keys
        are added — demo mode is removed then.
      </p>

      {compact && (
        <p className="pt-1 text-center text-xs text-[#8a7a85]">
          Prefer the full page?{' '}
          <Link href="/admin/login" className="font-semibold text-[#7b102d] underline">
            Open admin login
          </Link>
        </p>
      )}
    </form>
  );
}
