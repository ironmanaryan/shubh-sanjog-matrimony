'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, FileUp, Info, ShieldCheck, Smartphone, X } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const FALLBACK_UPI = { upiId: 'shubhsanjog@upi', payeeName: 'Shubh Sanjog Matrimony' };

// --- Mock QR placeholder ----------------------------------------------------
// Deterministic pseudo-QR rendered as SVG (placeholder until a real gateway is wired).
export function useMockQrMatrix(seed: string, size = 21): boolean[][] {
  return useMemo(() => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const rand = () => {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      return ((h >>> 0) % 1000) / 1000;
    };

    const grid: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) grid[y][x] = rand() > 0.52;
    }

    const drawFinder = (ox: number, oy: number) => {
      for (let y = -1; y <= 7; y++) {
        for (let x = -1; x <= 7; x++) {
          const gy = oy + y;
          const gx = ox + x;
          if (gy < 0 || gy >= size || gx < 0 || gx >= size) continue;
          const inRing = x >= 0 && x <= 6 && y >= 0 && y <= 6;
          if (!inRing) {
            grid[gy][gx] = false; // clear separator around finder
            continue;
          }
          const edge = x === 0 || y === 0 || x === 6 || y === 6;
          const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
          grid[gy][gx] = edge || core;
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(size - 7, 0);
    drawFinder(0, size - 7);

    // timing strips between finder patterns
    for (let i = 8; i < size - 8; i++) {
      grid[6][i] = i % 2 === 0;
      grid[i][6] = i % 2 === 0;
    }

    // keep the alignment area clear near bottom-right
    for (let y = size - 9; y < size - 4; y++) {
      for (let x = size - 9; x < size - 4; x++) {
        if (y >= 0 && x >= 0 && y < size && x < size) grid[y][x] = false;
      }
    }

    return grid;
  }, [seed, size]);
}

export function MockQrCode({ seed }: { seed: string }) {
  const matrix = useMockQrMatrix(seed);
  const cell = 8;
  const dim = matrix.length * cell;

  return (
    <div className="rounded-3xl border border-[#f2d9a8] bg-white p-3 shadow-sm">
      <svg viewBox={`0 0 ${dim} ${dim}`} width={176} height={176} role="img" aria-label="UPI QR code placeholder" className="rounded-xl">
        <rect width={dim} height={dim} fill="#ffffff" />
        {matrix.map((row, y) =>
          row.map((on, x) =>
            on ? <rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill="#2c0d16" /> : null
          )
        )}
      </svg>
      <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6a4a57]">Demo QR — scan with any UPI app</p>
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
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                  <MockQrCode seed={`${upi.upiId}|${plan.tier}|${plan.price}`} />
                  <div className="w-full space-y-3">
                    <div className="rounded-2xl bg-[#fff8ee] p-4">
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b102d]">Pay to UPI ID</div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <code className="text-lg font-black text-[#2c0d16]">{upi.upiId}</code>
                        <button type="button" onClick={handleCopy} className="inline-flex items-center gap-1 rounded-full border border-[#e5c88d] bg-white px-3 py-1.5 text-xs font-bold text-[#7b102d] transition hover:bg-[#fff7ee]">
                          <Copy size={12} />
                          {copied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <div className="mt-1 text-xs text-[#6a4a57]">{upi.payeeName}</div>
                    </div>
                    <div className="flex items-start gap-2 rounded-2xl bg-[#fffaf3] p-3 text-xs text-[#5a3743]">
                      <Info size={14} className="mt-0.5 shrink-0 text-[#d4a64a]" />
                      <span>Scan the QR or pay via GPay / PhonePe / Paytm, then note the <strong>UTR</strong> from your transaction history and submit it below.</span>
                    </div>
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
