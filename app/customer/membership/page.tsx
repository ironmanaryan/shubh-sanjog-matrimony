'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CheckCircle2, ChevronRight, Copy, CreditCard, FileUp, Info, ShieldCheck, Smartphone, Wallet, XCircle } from 'lucide-react';
import { PaymentQrCode } from '../../../components/UpiPaymentModal';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

type Plan = {
  tier: string;
  name?: string;
  price: number;
  durationDays: number;
  meetingsAllowed: number;
  profilesAllowed?: number;
  profilesMin?: number;
  profilesMax?: number;
};

type PaymentStatus = 'Pending Verification' | 'Approved' | 'Rejected' | string;

type PaymentRecord = {
  id: string;
  plan: string;
  amount: number;
  utr: string;
  status: PaymentStatus;
  rejectionReason?: string | null;
  receiptName?: string | null;
  createdAt: number;
  reviewedAt?: number | null;
};

const FALLBACK_UPI = { upiId: 'deepakrajmeh@okaxis', payeeName: 'Shubh Sanjog Matrimony' };

function formatINR(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`;
}

function formatDate(ts?: number | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MembershipCheckoutPage() {
  // Plans strictly from the API (membership_plans table) — no local catalog copy.
  const [plans, setPlans] = useState<Plan[]>([]);
  const [upi, setUpi] = useState(FALLBACK_UPI);
  const [selectedTier, setSelectedTier] = useState<string>('Gold');
  const [utr, setUtr] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsLoggedIn(Boolean(token));
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

    // Guarded GET that never throws — network failures ("TypeError: Failed to
    // fetch") resolve to null instead of crashing the checkout UI.
    async function fetchJson<T>(url: string): Promise<T | null> {
      if (!headers) return null;
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        return (await res.json()) as T;
      } catch (err) {
        console.error('membership request failed:', url, err);
        return null;
      }
    }

    async function load() {
      setLoading(true);
      try {
        // Each endpoint is guarded individually so one failure cannot wipe out
        // the other's data.
        const [plansJson, mineJson] = await Promise.all([
          fetchJson<{ plans?: Plan[]; upiId?: string; payeeName?: string }>(`${API}/payments/plans`),
          fetchJson<{ payments?: PaymentRecord[] }>(`${API}/payments/mine`),
        ]);

        if (plansJson) {
          if (Array.isArray(plansJson.plans) && plansJson.plans.length > 0) setPlans(plansJson.plans);
          if (plansJson.upiId) setUpi({ upiId: plansJson.upiId, payeeName: plansJson.payeeName || FALLBACK_UPI.payeeName });
        }
        if (mineJson) setPayments(mineJson.payments || []);

        if (!plansJson && !mineJson && headers) {
          setErrorMessage('Membership data is temporarily unavailable — the API server seems unreachable. Please refresh in a moment.');
        }
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedPlan = useMemo(() => plans.find((p) => p.tier === selectedTier) || plans[0], [plans, selectedTier]);

  const pendingPayment = payments.find((p) => p.status === 'Pending Verification');

  function validateUtr(value: string) {
    const trimmed = value.trim();
    if (trimmed.length < 6) return 'UTR / transaction reference must be at least 6 characters.';
    if (!/^[A-Za-z0-9\-]+$/.test(trimmed)) return 'UTR can only contain letters, numbers and dashes.';
    return '';
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(upi.upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorMessage('Could not copy the UPI ID. Please copy it manually.');
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');
    setStatusMessage('');

    if (!selectedPlan) {
      setErrorMessage('Please choose a plan first.');
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) {
      setErrorMessage('Please log in to submit your payment.');
      return;
    }
    const utrError = validateUtr(utr);
    if (utrError) {
      setErrorMessage(utrError);
      return;
    }
    if (!file) {
      setErrorMessage('Please upload your payment receipt / screenshot.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Receipt must be smaller than 5 MB.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('plan', selectedPlan.tier);
      formData.append('utr', utr.trim());
      formData.append('file', file);

      const res = await fetch(`${API}/payments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Payment submission failed');

      setStatusMessage(`Payment submitted for ${selectedPlan.tier} (${formatINR(selectedPlan.price)}). Our team will verify your UTR shortly.`);
      setUtr('');
      setFile(null);
      try {
        const mineRes = await fetch(`${API}/payments/mine`, { headers: { Authorization: `Bearer ${token}` } });
        if (mineRes.ok) {
          const mineJson = await mineRes.json();
          setPayments(mineJson.payments || []);
        }
      } catch (err) {
        // Refresh-only failure: the submission succeeded, so don't alarm the user.
        console.error('refresh payments failed', err);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Payment submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status: PaymentStatus) => {
    if (status === 'Approved') return 'bg-[#eaf8ef] text-[#0a7d4c]';
    if (status === 'Rejected') return 'bg-[#ffe5e5] text-[#9b1f2f]';
    return 'bg-[#fff0cf] text-[#8a5a11]';
  };

  return (
    <div className="min-h-screen bg-[#fffaf8] px-4 py-6 text-[#2c0d16] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 rounded-[28px] border border-[#f1d7a6] bg-white p-5 shadow-soft lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#7b102d]">Membership</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#2c0d16]">Choose your plan</h1>
          </div>
          <Link href="/customer" className="rounded-full bg-[#7b102d] px-4 py-2 text-center text-sm font-semibold text-white">Back to dashboard</Link>
        </div>

        {!isLoggedIn && (
          <div className="mb-6 rounded-2xl border border-[#f2d9a8] bg-[#fffaf3] p-4 text-sm text-[#5a3743]">
            You are browsing as a guest. <Link href="/login" className="font-bold text-[#7b102d] underline">Log in</Link> to submit a payment.
          </div>
        )}

        {statusMessage && <div className="mb-5 rounded-2xl border border-[#cdeeda] bg-[#effaf3] p-3 text-sm font-medium text-[#0a7d4c]">{statusMessage}</div>}
        {errorMessage && <div className="mb-5 rounded-2xl border border-[#f3cccc] bg-[#fdf1f1] p-3 text-sm font-medium text-[#9b1f2f]">{errorMessage}</div>}

        {/* Plan selection */}
        {loading ? (
          <div className="rounded-[24px] border border-[#f2d8a8] bg-white p-5 text-sm text-[#5a3743] shadow-soft">Loading plans…</div>
        ) : plans.length === 0 ? (
          <div className="rounded-[24px] border border-[#f2d8a8] bg-white p-5 text-sm text-[#5a3743] shadow-soft">
            Plans are unavailable right now. Please log in or contact us at 9034850873.
          </div>
        ) : (
          <section className="grid gap-4 md:grid-cols-3">
            {plans.map((plan) => {
            const active = selectedPlan?.tier === plan.tier;
            return (
              <button
                key={plan.tier}
                type="button"
                onClick={() => setSelectedTier(plan.tier)}
                className={`rounded-[24px] border p-5 text-left shadow-soft transition ${active ? 'border-[#7b102d] bg-gradient-to-br from-[#7b102d] to-[#43122b] text-white' : 'border-[#f2d8a8] bg-white hover:bg-[#fff7ee]'}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold uppercase tracking-[0.22em] ${active ? 'text-[#ffd9a8]' : 'text-[#7b102d]'}`}>{plan.tier}</span>
                  {active ? <BadgeCheck size={18} className={active ? 'text-[#ffd9a8]' : 'text-[#7b102d]'} /> : null}
                </div>
                <div className={`mt-3 text-3xl font-black ${active ? 'text-white' : 'text-[#2c0d16]'}`}>{formatINR(plan.price)}</div>
                <ul className={`mt-4 space-y-1.5 text-sm ${active ? 'text-[#fbe9dd]' : 'text-[#5a3743]'}`}>
                  <li>• {plan.durationDays}-day validity</li>
                  <li>• {plan.meetingsAllowed} meeting{plan.meetingsAllowed > 1 ? 's' : ''}</li>
                  {(plan.profilesMax ?? 0) > 0
                    ? <li>• Up to {plan.profilesMax} recommended profiles{(plan.profilesMin ?? 0) > 0 && plan.profilesMin !== plan.profilesMax ? ` (${plan.profilesMin}–${plan.profilesMax})` : ''}</li>
                    : <li>• Consultation session with slot booking</li>}
                </ul>
              </button>
            );
          })}
          </section>
        )}

        {/* Manual UPI payment — QR + proof submission, verified by our team */}
        <section className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          {/* Real UPI QR + payee details */}
          <div className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
            <h2 className="flex items-center gap-2 text-xl font-black text-[#2c0d16]"><Smartphone size={20} /> Pay via UPI</h2>
            <p className="mt-2 text-sm text-[#5a3743]">
              Pay <span className="font-bold">{formatINR(selectedPlan?.price ?? 0)}</span> for the <span className="font-bold">{selectedPlan?.tier}</span> plan using the QR code or UPI ID below, then submit your transaction details for verification.
            </p>

            <div className="mt-5 flex flex-col items-center">
              <PaymentQrCode />

              {/* UPI ID directly under the QR for easy copy-pasting */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <span className="text-sm text-[#5a3743]">
                  <strong className="font-bold text-[#2c0d16]">UPI ID:</strong>{' '}
                  <code className="text-base font-black text-[#2c0d16]">{upi.upiId}</code>
                </span>
                <button type="button" onClick={handleCopy} aria-label="Copy UPI ID" className="inline-flex items-center gap-1 rounded-full border border-[#e5c88d] bg-white px-3 py-1.5 text-xs font-bold text-[#7b102d] transition hover:bg-[#fff7ee]">
                  <Copy size={12} />
                  {copied ? 'Copied!' : 'Copy UPI ID'}
                </button>
              </div>
              <div className="mt-1 text-xs text-[#6a4a57]">{upi.payeeName}</div>

              <div className="mt-3 flex items-start gap-2 self-stretch rounded-2xl bg-[#fffaf3] p-3 text-xs text-[#5a3743]">
                <Info size={14} className="mt-0.5 shrink-0 text-[#d4a64a]" />
                <span>Open GPay / PhonePe / Paytm / BHIM → scan or pay to the UPI ID → note the <strong>UTR / transaction ID</strong> from your payment app history → submit it here with a screenshot.</span>
              </div>
            </div>
          </div>

          {/* Submission form */}
          <form onSubmit={handleSubmit} className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
            <h2 className="flex items-center gap-2 text-xl font-black text-[#2c0d16]"><CreditCard size={20} /> Submit payment details</h2>

            {pendingPayment ? (
              <div className="mt-4 rounded-2xl bg-[#fff0cf] p-3 text-sm text-[#8a5a11]">
                Your <strong>{pendingPayment.plan}</strong> payment (UTR {pendingPayment.utr}) is already pending verification.
              </div>
            ) : null}

            <label className="mt-5 block text-sm font-bold text-[#2c0d16]" htmlFor="utr">UPI Transaction ID / UTR Reference *</label>
            <input
              id="utr"
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              placeholder="e.g., 402512345678"
              className="mt-2 w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2.5 text-sm tracking-wide"
            />

            <label className="mt-5 block text-sm font-bold text-[#2c0d16]" htmlFor="receipt">Payment screenshot / receipt * <span className="font-normal text-[#6a4a57]">(image or PDF, max 5 MB)</span></label>
            <label htmlFor="receipt" className="mt-2 flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-[#d4a64a] bg-[#fffaf3] px-4 py-4 text-sm text-[#5a3743] transition hover:bg-[#fff7ee]">
              <span className="flex items-center gap-2"><FileUp size={16} className="text-[#7b102d]" />{file ? file.name : 'Choose receipt file…'}</span>
              <ChevronRight size={14} />
              <input id="receipt" type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>

            <button type="submit" disabled={submitting || !isLoggedIn} className="mt-6 w-full rounded-full bg-[#7b102d] px-4 py-3 text-sm font-black text-white transition hover:bg-[#601225] disabled:opacity-60">
              {submitting ? 'Submitting…' : `Submit ${selectedPlan?.tier} payment (${formatINR(selectedPlan?.price ?? 0)})`}
            </button>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-[#6a4a57]"><ShieldCheck size={13} /> Payments are verified manually by our team before membership activation.</p>
          </form>
        </section>

        {/* Payment history */}
        <section className="mt-6 rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xl font-black text-[#2c0d16]"><Wallet size={20} /> My payments</h2>
          </div>
          {loading ? (
            <div className="rounded-2xl bg-[#fffaf3] p-4 text-sm text-[#5a3743]">Loading…</div>
          ) : payments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#f2d9a8] bg-[#fffaf3] p-4 text-sm text-[#5a3743]">No payments submitted yet.</div>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div key={payment.id} className="flex flex-col gap-2 rounded-2xl border border-[#f2d9a8] bg-[#fffaf3] p-4 text-sm text-[#5a3743] sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-bold text-[#2c0d16]">{payment.plan} Plan — {formatINR(payment.amount)}</div>
                    <div className="mt-0.5 text-xs">UTR: <span className="font-mono">{payment.utr}</span> • Submitted {formatDate(payment.createdAt)}</div>
                    {payment.status === 'Rejected' && payment.rejectionReason ? <div className="mt-0.5 text-xs text-[#9b1f2f]">Reason: {payment.rejectionReason}</div> : null}
                  </div>
                  <span className={`inline-flex items-center gap-1 self-start rounded-full px-3 py-1 text-[10px] font-bold uppercase sm:self-center ${statusBadge(payment.status)}`}>
                    {payment.status === 'Approved' ? <CheckCircle2 size={12} /> : payment.status === 'Rejected' ? <XCircle size={12} /> : null}
                    {payment.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
