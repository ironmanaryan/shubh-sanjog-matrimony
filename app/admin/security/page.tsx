'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, User, Lock, Trash2, ArrowLeft, Save } from 'lucide-react';
import { adminAuthHeaders, clearAdminSession, updateAdminToken } from '@/lib/admin-session';

type AdminAccount = {
  id: string;
  username: string;
  email: string;
  created_at?: string;
};

type Tone = 'error' | 'success' | 'info';

const TONE_CLASSES: Record<Tone, string> = {
  error: 'border border-red-200 bg-red-50 text-[#9b1f2f]',
  success: 'border border-emerald-200 bg-emerald-50 text-[#0a7d4c]',
  info: 'border border-[#f2d9a8] bg-[#fffaf3] text-[#5a3743]',
};

const MIN_PASSWORD = 8;
const DELETE_PHRASE = 'DELETE';

/**
 * /admin/security — change the master admin username/password, or delete the
 * account entirely (which resets the app to first-time setup).
 *
 * Backed by /api/admin/credentials. Every mutating call requires the current
 * password server-side, so this page never trusts the token alone.
 */
export default function AdminSecurityPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ username: '', currentPassword: '', newPassword: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<Tone>('info');
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const notify = useCallback((text: string, t: Tone = 'info') => {
    setMessage(text);
    setTone(t);
  }, []);

  // Load the real account from the server rather than decoding the JWT locally.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/admin/credentials', {
          headers: adminAuthHeaders(),
          cache: 'no-store',
        });

        if (res.status === 401) {
          clearAdminSession();
          if (!cancelled) router.replace('/admin/login');
          return;
        }

        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Could not load admin account');

        if (!cancelled) {
          setAdmin(json.admin ?? null);
          setForm((s) => ({ ...s, username: json.admin?.username ?? '' }));
        }
      } catch (err) {
        if (!cancelled) notify(err instanceof Error ? err.message : 'Could not load admin account', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [notify, router]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    const nextUsername = form.username.trim();
    const usernameChanged = Boolean(admin && nextUsername && nextUsername !== admin.username);

    if (!usernameChanged && !form.newPassword) {
      return notify('Nothing to update', 'error');
    }
    if (form.newPassword && form.newPassword.length < MIN_PASSWORD) {
      return notify(`New password must be at least ${MIN_PASSWORD} characters`, 'error');
    }
    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      return notify('New passwords do not match', 'error');
    }
    if (!form.currentPassword) {
      return notify('Enter your current password to confirm the change', 'error');
    }

    setBusy(true);
    notify('');
    try {
      const body: Record<string, string> = { currentPassword: form.currentPassword };
      if (usernameChanged) body.username = nextUsername;
      if (form.newPassword) body.password = form.newPassword;

      const res = await fetch('/api/admin/credentials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 401) {
        clearAdminSession();
        router.replace('/admin/login');
        return;
      }
      if (!res.ok) throw new Error(json.error || 'Update failed');

      // The server re-issues the JWT so it carries the new username/email.
      if (json.token) updateAdminToken(json.token);
      setAdmin(json.admin ?? admin);
      setForm({ username: json.admin?.username ?? nextUsername, currentPassword: '', newPassword: '', confirmPassword: '' });
      notify('Credentials updated successfully.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Update failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm.trim() !== DELETE_PHRASE) {
      return notify(`Type ${DELETE_PHRASE} to confirm`, 'error');
    }
    if (!form.currentPassword) {
      return notify('Enter your current password to confirm deletion', 'error');
    }
    if (
      !confirm(
        'Permanently delete the admin account? This resets the app to initial setup state and cannot be undone.'
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/admin/credentials', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({ confirm: DELETE_PHRASE, currentPassword: form.currentPassword }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || 'Delete failed');

      clearAdminSession();
      notify('Admin account deleted. Redirecting to setup…', 'success');
      setTimeout(() => router.replace('/admin/setup'), 1200);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Delete failed', 'error');
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fffaf8] p-8 text-sm text-[#5a3743]">
        Loading security settings…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fffaf8] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-[#7b102d] hover:underline">
          <ArrowLeft size={16} /> Back to Admin Panel
        </Link>

        <div className="mt-4 rounded-[28px] border border-[#f1d7a6] bg-white p-6 shadow-soft sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7b102d] text-white">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h1 className="text-xl font-black text-[#2c0d16]">Admin Security Settings</h1>
              <p className="text-sm text-[#5a3743]">Update your login credentials or reset the admin account</p>
            </div>
          </div>

          {admin && (
            <div className="mt-4 rounded-xl bg-[#fffaf3] px-4 py-3 text-sm">
              <div className="font-semibold text-[#2c0d16]">Current admin</div>
              <div className="text-[#5a3743]">
                {admin.username} • {admin.email}
              </div>
            </div>
          )}

          <form onSubmit={handleUpdate} className="mt-6 space-y-4">
            <h2 className="flex items-center gap-2 text-base font-bold text-[#2c0d16]">
              <User size={16} /> Update Credentials
            </h2>

            <div>
              <label htmlFor="sec-username" className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">
                Username
              </label>
              <input
                id="sec-username"
                type="text"
                value={form.username}
                onChange={(e) => setForm((s) => ({ ...s, username: e.target.value }))}
                placeholder="Username"
                className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-4 py-3 text-sm outline-none focus:border-[#7b102d] focus:ring-2 focus:ring-[#7b102d]/15"
                disabled={busy}
              />
            </div>

            <div>
              <label htmlFor="sec-current" className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">
                Current Password <span className="font-normal text-[#8a7a85]">(required for any change)</span>
              </label>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#b09a92]" />
                <input
                  id="sec-current"
                  type="password"
                  value={form.currentPassword}
                  onChange={(e) => setForm((s) => ({ ...s, currentPassword: e.target.value }))}
                  placeholder="Current password"
                  className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] py-3 pl-10 pr-4 text-sm outline-none focus:border-[#7b102d] focus:ring-2 focus:ring-[#7b102d]/15"
                  autoComplete="current-password"
                  disabled={busy}
                />
              </div>
            </div>

            <div>
              <label htmlFor="sec-new" className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">
                New Password <span className="font-normal text-[#8a7a85]">(leave blank to keep current)</span>
              </label>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#b09a92]" />
                <input
                  id="sec-new"
                  type="password"
                  value={form.newPassword}
                  onChange={(e) => setForm((s) => ({ ...s, newPassword: e.target.value }))}
                  placeholder={`New password (min ${MIN_PASSWORD} chars)`}
                  className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] py-3 pl-10 pr-4 text-sm outline-none focus:border-[#7b102d] focus:ring-2 focus:ring-[#7b102d]/15"
                  autoComplete="new-password"
                  disabled={busy}
                />
              </div>
            </div>

            <div>
              <label htmlFor="sec-confirm" className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#b09a92]" />
                <input
                  id="sec-confirm"
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm((s) => ({ ...s, confirmPassword: e.target.value }))}
                  placeholder="Confirm new password"
                  className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] py-3 pl-10 pr-4 text-sm outline-none focus:border-[#7b102d] focus:ring-2 focus:ring-[#7b102d]/15"
                  autoComplete="new-password"
                  disabled={busy}
                />
              </div>
            </div>

            {message && (
              <div className={`rounded-xl px-3.5 py-2.5 text-sm font-medium ${TONE_CLASSES[tone]}`} role="status">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#7b102d] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#7b102d]/20 hover:bg-[#68001a] disabled:opacity-60"
            >
              <Save size={16} /> {busy ? 'Saving…' : 'Save Changes'}
            </button>
          </form>

          <div className="mt-8 border-t border-[#f2d9a8] pt-6">
            <h2 className="flex items-center gap-2 text-base font-bold text-[#9b1f2f]">
              <Trash2 size={16} /> Danger Zone
            </h2>
            <p className="mt-1 text-sm text-[#5a3743]">
              Permanently delete the admin account. This resets the app back to initial setup state and cannot be
              undone. Your current password is required.
            </p>

            <div className="mt-4">
              <label htmlFor="sec-delete" className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">
                Type {DELETE_PHRASE} to confirm
              </label>
              <input
                id="sec-delete"
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={DELETE_PHRASE}
                className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm outline-none focus:border-[#9b1f2f] focus:ring-2 focus:ring-[#9b1f2f]/15"
                disabled={busy}
              />
            </div>

            <button
              onClick={handleDelete}
              disabled={busy || deleteConfirm.trim() !== DELETE_PHRASE}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#9b1f2f] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#9b1f2f]/20 hover:bg-[#7a1926] disabled:opacity-40"
            >
              <Trash2 size={16} /> Delete Admin Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
