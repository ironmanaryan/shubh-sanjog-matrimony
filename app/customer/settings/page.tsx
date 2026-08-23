'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  EyeOff,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import PrivacySettings from '@/components/customer/PrivacySettings';
import { requestJson } from '@/lib/api-client';
import { clearSession, getSession } from '@/lib/auth-client';

// Account Settings (scope §3 customer panel): privacy controls + the
// self-service account deletion flow required by §31/§32 ("account deletion /
// data removal policy"). Deletion is destructive and irreversible, so it is
// gated behind an explicit typed-confirmation modal.
const CONFIRM_PHRASE = 'DELETE';

export default function AccountSettingsPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ identifier?: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  // Read the cached session after mount (localStorage is client-only).
  useEffect(() => {
    setSession(getSession().user);
  }, []);

  const canConfirm = confirmText.trim().toUpperCase() === CONFIRM_PHRASE;

  async function handleDeleteAccount() {
    if (!canConfirm || deleting) return;
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Your session has expired. Please log in again.');
      return;
    }
    setDeleting(true);
    setError('');
    try {
      // The route sits behind verifyTokenMiddleware — always send the JWT.
      const { ok, json, networkError } = await requestJson('/customer/delete-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (networkError) {
        setError('Could not reach the server. Your account has NOT been deleted — please try again.');
        return;
      }
      const detail = (json ?? {}) as { error?: string };
      if (!ok) {
        setError(detail.error || 'Account deletion failed. Please try again.');
        return;
      }
      // Success — the server revoked every session, so drop the local one too.
      clearSession();
      router.replace('/?deleted=1');
    } catch {
      setError('Something went wrong. Your account has NOT been deleted — please try again.');
    } finally {
      setDeleting(false);
    }
  }

  function closeModal() {
    if (deleting) return;
    setModalOpen(false);
    setConfirmText('');
    setError('');
  }

  return (
    <div className="min-h-screen bg-[#fffaf8] px-4 pb-20 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-6 rounded-[28px] border border-[#f1d7a6] bg-white p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#7b102d]">Customer panel</p>
              <h1 className="mt-2 flex items-center gap-2 text-2xl font-black text-[#2c0d16]">
                <ShieldCheck size={22} className="text-[#7b102d]" /> Account Settings
              </h1>
              <p className="mt-1 text-sm text-[#5a3743]">
                Signed in as <span className="font-bold">{session?.identifier || 'your account'}</span>
              </p>
            </div>
            <Link href="/customer" className="inline-flex items-center gap-2 rounded-full border border-[#e5c88d] bg-white px-4 py-2 text-sm font-semibold text-[#7b102d] transition hover:bg-[#fff7ee]">
              <ArrowLeft size={15} /> Back to dashboard
            </Link>
          </div>
        </div>

        {/* Privacy controls */}
        <section aria-label="Privacy settings" className="rounded-[24px] border border-[#f2d8a8] bg-white p-5 shadow-soft sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-black text-[#2c0d16]">
            <EyeOff size={18} className="text-[#7b102d]" /> Privacy controls
          </h2>
          <p className="mb-4 mt-1 text-sm text-[#5a3743]">
            Choose what other members can see. Sensitive details stay hidden until a match is accepted or the bureau approves your profile.
          </p>
          <PrivacySettings />
        </section>

        {/* Danger zone */}
        <section aria-label="Danger zone" className="mt-6 rounded-[24px] border border-[#f3cccc] bg-[#fdf6f6] p-5 shadow-soft sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-black text-[#9b1f2f]">
            <AlertTriangle size={18} /> Danger zone
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#5a3743]">
            Deleting your account permanently removes your biodata, documents, matches and appointments, anonymizes your record,
            and signs you out everywhere. <strong>This cannot be undone.</strong> Payment records are retained only where required
            for accounting.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#9b1f2f]/40 bg-white px-5 py-2.5 text-sm font-bold text-[#9b1f2f] transition hover:bg-[#9b1f2f] hover:text-white"
          >
            <Trash2 size={15} /> Delete my account
          </button>
        </section>
      </div>

      {/* Confirmation modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2c0d16]/60 p-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div className="w-full max-w-md rounded-[24px] border border-[#f3cccc] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <h3 id="delete-account-title" className="flex items-center gap-2 text-xl font-black text-[#2c0d16]">
                <AlertTriangle size={20} className="text-[#9b1f2f]" /> Delete your account?
              </h3>
              <button onClick={closeModal} aria-label="Close dialog" className="rounded-full border border-[#f2d9a8] p-1.5 text-[#7b102d] transition hover:bg-[#fff7ee]">
                <X size={16} />
              </button>
            </div>

            <ul className="mt-4 space-y-2 rounded-2xl bg-[#fdf1f1] p-4 text-sm text-[#7a2c39]">
              <li>• Your biodata, partner preferences and profile are erased.</li>
              <li>• Uploaded documents, horoscope and receipts are deleted from our servers.</li>
              <li>• Matches, interests, shortlists and appointments are removed.</li>
              <li>• You are signed out on all devices; this action is irreversible.</li>
            </ul>

            <label htmlFor="confirm-delete" className="mt-4 block text-sm font-bold text-[#2c0d16]">
              Type <span className="rounded-md bg-[#fff1f1] px-1.5 py-0.5 font-mono font-black text-[#9b1f2f]">{CONFIRM_PHRASE}</span> to confirm
            </label>
            <input
              id="confirm-delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={`Type ${CONFIRM_PHRASE} to enable deletion`}
              autoComplete="off"
              className="mt-2 w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2.5 text-sm tracking-wide"
            />

            {error && <div className="mt-3 rounded-xl border border-[#f3cccc] bg-[#fdf1f1] p-3 text-sm font-medium text-[#9b1f2f]">{error}</div>}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row-reverse">
              <button
                onClick={() => void handleDeleteAccount()}
                disabled={!canConfirm || deleting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#9b1f2f] px-5 py-3 text-sm font-black text-white transition hover:bg-[#7a1826] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                <Trash2 size={15} />
                {deleting ? 'Deleting…' : 'Permanently delete my account'}
              </button>
              <button
                onClick={closeModal}
                disabled={deleting}
                className="inline-flex w-full items-center justify-center rounded-full border border-[#e5c88d] px-5 py-3 text-sm font-semibold text-[#7b102d] transition hover:bg-[#fff7ee] disabled:opacity-50 sm:w-auto"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
