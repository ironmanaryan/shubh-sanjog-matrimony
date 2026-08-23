'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, FileUp, Info, ShieldCheck, X } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const FALLBACK_UPI = { upiId: 'deepakrajmeh@okaxis', payeeName: 'Shubh Sanjog Matrimony' };

// --- UPI QR ------------------------------------------------------------------
// Real UPI QR (encodes upi://pay?pa=deepakrajmeh@okaxis…) shown inside a clean
// rounded frame. Shared by the payment modal and the membership checkout page.
export function PaymentQrCode() {
  return (
    <div className="rounded-[28px] border border-[#f2d9a8] bg-white p-3 shadow-sm">
      <Image
        src="/images/payment-qr.jpg"
        alt="UPI QR code — scan with any UPI app to pay Shubh Sanjog Matrimony"
        width={256}
        height={256}
        quality={85}
        className="w-64 h-64 object-cover rounded-2xl border shadow-sm mx-auto"
      />
      <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6a4a57]">Scan with any UPI app</p>
    </div>
  );
}

type UpiPaymentModalProps = {
  plan: { tier: string; price: number } | null;
  onClose: () => void;
};

export default function UpiPaymentModal({ plan, onClose }: UpiPaymentModalProps) {
  const [upi, setUpi] = useState(FALLBACK_UPI);
  const [utr, setUtr] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [success, setSuccess] = useState<{ status: string } | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!plan) return;
    setIsLoggedIn(Boolean(localStorage.getItem('token')));

    async function loadUpi() {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API}/payments/plans`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) return;
        const json = await res.json();
        if (json.upiId) setUpi({ upiId: json.upiId, payeeName: json.payeeName || FALLBACK_UPI.payeeName });
      } catch {
        // keep fallback UPI details
      }
    }
    loadUpi();
  }, [plan]);

  if (!plan) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(upi.upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorMessage('Could not copy the UPI ID. Please copy it manually.');
    }
  };

  function validateUtr(value: string) {
    const trimmed = value.trim();
    if (trimmed.length < 6) return 'UTR / transaction reference must be at least 6 characters.';
    if (!/^[A-Za-z0-9\-]+$/.test(trimmed)) return 'UTR can only contain letters, numbers and dashes.';
    return '';
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');

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
      formData.append('plan', plan.tier);
      formData.append('utr', utr.trim());
      formData.append('file', file);

      const res = await fetch(`${API}/payments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Payment submission failed');
      setSuccess({ status: json.payment?.status || 'Pending Verification' });
      setUtr('');
      setFile(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Payment submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSuccess(null);
    setErrorMessage('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2c0d16]/60 p-4" onClick={handleClose}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[28px] border border-[#f1d7a6] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#7b102d]">UPI Payment</p>
            <h2 className="mt-1 text-2xl font-black text-[#2c0d16]">{plan.tier} Membership — ₹{plan.price.toLocaleString('en-IN')}</h2>
          </div>
          <button onClick={handleClose} aria-label="Close payment dialog" className="rounded-full border border-[#f2d9a8] p-2 text-[#7b102d] transition hover:bg-[#fff7ee]">
            <X size={16} />
          </button>
        </div>

        {success ? (
          <div className="space-y-4 py-4 text-center">
            <CheckCircle2 size={44} className="mx-auto text-[#0a7d4c]" />
            <h3 className="text-xl font-black text-[#2c0d16]">Payment submitted!</h3>
            <p className="text-sm text-[#5a3743]">
              Your {plan.tier} plan payment (<strong>{utr.trim()}</strong>) is now <span className="font-bold">Pending Verification</span>. Our team verifies UTRs shortly — you can track it under Membership in your dashboard.
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <Link href="/customer/membership" className="rounded-full bg-[#7b102d] px-4 py-2 text-sm font-bold text-white" onClick={handleClose}>Go to my payments</Link>
              <button onClick={handleClose} className="rounded-full border border-[#e5c88d] px-4 py-2 text-sm font-semibold text-[#7b102d]">Close</button>
            </div>
          </div>
        ) : (
          <>
            {errorMessage && <div className="mb-4 rounded-2xl border border-[#f3cccc] bg-[#fdf1f1] p-3 text-sm font-medium text-[#9b1f2f]">{errorMessage}</div>}

            {isLoggedIn === false ? (
              <div className="rounded-2xl border border-[#f2d9a8] bg-[#fffaf3] p-4 text-sm text-[#5a3743]">
                Please <Link href="/login" className="font-bold text-[#7b102d] underline">log in</Link> to submit your UPI payment for the {plan.tier} plan.
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="flex flex-col items-center">
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
                    <span>Scan the QR or pay via GPay / PhonePe / Paytm, then note the <strong>UTR</strong> from your transaction history and submit it below.</span>
                  </div>
                </div>

                <label className="mt-5 block text-sm font-bold text-[#2c0d16]" htmlFor={`utr-${plan.tier}`}>UPI UTR / Transaction Reference ID *</label>
                <input
                  id={`utr-${plan.tier}`}
                  value={utr}
                  onChange={(e) => setUtr(e.target.value)}
                  placeholder="e.g., 402512345678"
                  className="mt-2 w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2.5 text-sm tracking-wide"
                />

                <label className="mt-4 block text-sm font-bold text-[#2c0d16]" htmlFor={`receipt-${plan.tier}`}>
                  Payment receipt / screenshot * <span className="font-normal text-[#6a4a57]">(image or PDF, max 5 MB)</span>
                </label>
                <label htmlFor={`receipt-${plan.tier}`} className="mt-2 flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-[#d4a64a] bg-[#fffaf3] px-4 py-3.5 text-sm text-[#5a3743] transition hover:bg-[#fff7ee]">
                  <span className="flex items-center gap-2"><FileUp size={15} className="text-[#7b102d]" />{file ? file.name : 'Choose receipt file…'}</span>
                  <input id={`receipt-${plan.tier}`} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </label>

                <button type="submit" disabled={submitting} className="mt-5 w-full rounded-full bg-[#7b102d] px-4 py-3 text-sm font-black text-white transition hover:bg-[#601225] disabled:opacity-60">
                  {submitting ? 'Submitting…' : `I've paid ₹${plan.price.toLocaleString('en-IN')} — submit for verification`}
                </button>
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-[#6a4a57]"><ShieldCheck size={13} /> Verified manually before membership activation.</p>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
