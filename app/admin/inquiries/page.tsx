'use client';

import Link from 'next/link';
import { API } from '@/lib/api-base';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Inbox,
  Mail,
  MessageSquareText,
  Phone,
  RefreshCw,
} from 'lucide-react';
import AdminSignInGate from '@/components/admin/AdminSignInGate';
import { clearSession, getSession, isNetworkError } from '@/lib/auth-client';


// Dedicated Admin Inquiries management route — every Contact Us submission
// lands here for triage (New → In Progress → Resolved).

const STATUSES = ['New', 'In Progress', 'Resolved'] as const;
type InquiryStatus = (typeof STATUSES)[number];

type Inquiry = {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  subject: string;
  message: string;
  status: InquiryStatus | string;
  adminNote: string | null;
  createdAt: number;
  updatedAt: number;
};

const STATUS_STYLES: Record<string, string> = {
  New: 'bg-[#e0ecff] text-[#1d4ed8]',
  'In Progress': 'bg-[#fff0cf] text-[#8a5a11]',
  Resolved: 'bg-[#eaf8ef] text-[#0a7d4c]',
};

function StatusIcon({ status }: { status: string }) {
  if (/resolved/i.test(status)) return <CheckCircle2 size={12} />;
  if (/progress/i.test(status)) return <Clock3 size={12} />;
  return <Inbox size={12} />;
}

export default function AdminInquiriesPage() {
  const [authState, setAuthState] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [canTriage, setCanTriage] = useState(true);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [statusFilter, setStatusFilter] = useState<'' | InquiryStatus>('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Staff session bootstrap — same resilience ladder as the main panel.
  useEffect(() => {
    const { token, user } = getSession();
    const cachedIsAdmin =
      user?.role === 'admin' ||
      Boolean(user?.identifier && user.identifier.toLowerCase().includes('admin'));

    if (!token) {
      setAuthState('denied');
      return;
    }

    let settled = false;
    fetch(`${API}/admin/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        settled = true;
        if (!res.ok) {
          if (cachedIsAdmin) setAuthState('allowed');
          else {
            clearSession();
            setAuthState('denied');
          }
          return;
        }
        const json = await res.json().catch(() => ({}));
        // Only reviewProfiles holders may change inquiry status; everyone on
        // staff may read the queue.
        setCanTriage(json?.me?.permissions ? json.me.permissions.reviewProfiles !== false : true);
        setAuthState('allowed');
      })
      .catch((err) => {
        settled = true;
        if (cachedIsAdmin && isNetworkError(err)) setAuthState('allowed');
        else setAuthState('denied');
      });

    const timeout = setTimeout(() => {
      if (!settled && cachedIsAdmin) setAuthState('allowed');
    }, 8000);
    return () => clearTimeout(timeout);
  }, []);

  const loadInquiries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Please sign in as staff to view inquiries.');
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const res = await fetch(`${API}/admin/inquiries${query}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not load inquiries');
      setInquiries(json.inquiries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load inquiries');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (authState === 'allowed') void loadInquiries();
  }, [authState, loadInquiries]);

  async function updateStatus(inquiry: Inquiry, status: InquiryStatus) {
    setBusyId(inquiry.id);
    setMessage('');
    setError('');
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Session expired — sign in again.');
      const res = await fetch(`${API}/admin/inquiries/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: inquiry.id, status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not update the inquiry');
      setMessage(`Enquiry from ${inquiry.name} marked “${status}”.`);
      await loadInquiries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the inquiry');
    } finally {
      setBusyId(null);
    }
  }

  if (authState === 'checking') {
    return <div className="min-h-screen bg-[#fffaf8] px-4 py-12 text-[#2c0d16]">Loading inquiries…</div>;
  }

  if (authState === 'denied') {
    return <AdminSignInGate />;
  }

  const newCount = inquiries.filter((i) => i.status === 'New').length;

  return (
    <div className="min-h-screen bg-[#fffaf8] px-4 py-6 text-[#2c0d16] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6 rounded-[28px] border border-[#f1d7a6] bg-white p-5 shadow-soft">
          <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#7b102d] hover:underline">
            <ArrowLeft size={15} /> Back to admin panel
          </Link>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#7b102d]">Admin panel</p>
              <h1 className="mt-2 flex items-center gap-3 text-3xl font-black tracking-[-0.04em]">
                <MessageSquareText size={26} className="text-[#7b102d]" />
                Contact Us Inquiries
              </h1>
              <p className="mt-1 text-sm text-[#6a4a57]">Every enquiry from the public contact form lands here for follow-up.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#fff1dc] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[#7b102d]">{newCount} new</span>
              <button onClick={() => void loadInquiries()} className="inline-flex items-center gap-1.5 rounded-full border border-[#e5c88d] bg-white px-4 py-2 text-sm font-semibold text-[#7b102d] transition hover:bg-[#fff7ee]">
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
          </div>

          {/* Status filter */}
          <div className="mt-4 flex flex-wrap gap-2">
            {(['', ...STATUSES] as Array<'' | InquiryStatus>).map((status) => (
              <button
                key={status || 'all'}
                onClick={() => setStatusFilter(status)}
                aria-pressed={statusFilter === status}
                className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                  statusFilter === status ? 'bg-[#7b102d] text-white shadow-lg shadow-[#7b102d]/20' : 'border border-[#e9d4a3] bg-white text-[#4d2c36] hover:bg-[#fff7ee]'
                }`}
              >
                {status || 'All'}
              </button>
            ))}
          </div>
        </div>

        {message && <div className="mb-4 rounded-2xl border border-[#cdeeda] bg-[#effaf3] p-3 text-sm font-medium text-[#0a7d4c]">{message}</div>}
        {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-[#9b1f2f]">{error}</div>}

        {/* Inquiry list */}
        {loading ? (
          <div className="rounded-[28px] border border-[#f2d9a8] bg-white p-6 text-sm text-[#5a3743] shadow-soft">Loading inquiries…</div>
        ) : inquiries.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-[#f2d9a8] bg-white p-10 text-center shadow-soft">
            <Inbox size={32} className="mx-auto text-[#c9a86a]" />
            <p className="mt-3 text-sm font-semibold text-[#5a3743]">No inquiries{statusFilter ? ` with status “${statusFilter}”` : ' yet'}.</p>
            <p className="mt-1 text-xs text-[#8a6a75]">Submissions from the public Contact Us page will appear here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {inquiries.map((inquiry) => (
              <article key={inquiry.id} className="rounded-[24px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="flex flex-wrap items-center gap-2 text-lg font-black">
                      {inquiry.name}
                      <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[inquiry.status] || 'bg-[#f1ece7] text-[#6a4a57]'}`}>
                        <StatusIcon status={inquiry.status} /> {inquiry.status}
                      </span>
                    </h2>
                    <p className="mt-0.5 text-xs font-bold uppercase tracking-[0.14em] text-[#8a6a75]">{inquiry.subject}</p>
                  </div>
                  <time className="text-xs text-[#6a4a57]" dateTime={new Date(inquiry.createdAt).toISOString()}>
                    {new Date(inquiry.createdAt).toLocaleString()}
                  </time>
                </div>

                <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-[#fffaf3] p-4 text-sm leading-6 text-[#4d2c36]">{inquiry.message}</p>

                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  {inquiry.mobile ? (
                    <a href={`tel:${inquiry.mobile}`} className="inline-flex items-center gap-1.5 font-semibold text-[#7b102d] hover:underline">
                      <Phone size={14} /> {inquiry.mobile}
                    </a>
                  ) : null}
                  {inquiry.email ? (
                    <a href={`mailto:${inquiry.email}`} className="inline-flex items-center gap-1.5 font-semibold text-[#7b102d] hover:underline">
                      <Mail size={14} /> {inquiry.email}
                    </a>
                  ) : null}
                  {!inquiry.mobile && !inquiry.email ? <span className="text-xs italic text-[#8a6a75]">No contact details provided</span> : null}
                  {inquiry.mobile ? (
                    <a
                      href={`https://wa.me/${inquiry.mobile.replace(/[^\d]/g, '').replace(/^0+/, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#128C4A] underline underline-offset-4"
                    >
                      Reply on WhatsApp
                    </a>
                  ) : null}
                </div>

                {inquiry.adminNote ? (
                  <div className="mt-3 rounded-xl border border-dashed border-[#d4a64a] bg-[#fffbf2] p-3 text-xs text-[#5a3743]">
                    <span className="font-bold uppercase tracking-wide text-[#7b102d]">Internal note:</span> {inquiry.adminNote}
                  </div>
                ) : null}

                {canTriage && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(STATUSES as readonly InquiryStatus[]).map((status) => (
                      <button
                        key={status}
                        disabled={busyId === inquiry.id || inquiry.status === status}
                        onClick={() => void updateStatus(inquiry, status)}
                        className={`rounded-full px-4 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                          status === 'Resolved'
                            ? 'bg-[#0a7d4c] text-white'
                            : status === 'In Progress'
                              ? 'bg-[#d4a64a] text-white'
                              : 'border border-[#e9d4a3] bg-white text-[#4d2c36]'
                        }`}
                      >
                        {busyId === inquiry.id ? 'Saving…' : `Mark ${status}`}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
