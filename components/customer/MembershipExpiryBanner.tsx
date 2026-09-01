'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, ShieldCheck } from 'lucide-react';
import { API } from '@/lib/api-base';

type Membership = {
  tier?: string;
  startedAt?: number | null;
  expiresAt?: number | null;
  active?: boolean;
  meetingsAllowed?: number | null;
  meetingsLeft?: number | null;
} | null;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const RENEWAL_WINDOW_DAYS = 7;

function classify(expiryMs: number | null | undefined, active: boolean | undefined) {
  if (!expiryMs) return null;
  const now = Date.now();
  if (!active || expiryMs <= now) {
    return { tone: 'expired' as const, daysLeft: 0, expiresAt: expiryMs };
  }
  const diff = expiryMs - now;
  const daysLeft = Math.ceil(diff / ONE_DAY_MS);
  if (diff <= RENEWAL_WINDOW_DAYS * ONE_DAY_MS) {
    return { tone: 'expiring' as const, daysLeft, expiresAt: expiryMs };
  }
  return null;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * MembershipExpiryBanner
 *
 * Sits at the top of the customer dashboard / membership views and reads
 * GET /api/customer/membership. Renders three states:
 *   - expired: red banner, primary CTA "Renew Membership" → /membership/plans
 *   - expiring: amber banner, "Renews in N days" with the same CTA
 *   - healthy: returns null (no banner)
 *
 * The banner is intentionally low-ceremony: it never blocks scrolling and
 * never throws — a failed membership fetch (logged in console) just hides
 * the banner so the dashboard keeps rendering.
 */
export default function MembershipExpiryBanner() {
  const [membership, setMembership] = useState<Membership>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/customer/membership`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setMembership(json.membership || null);
      } catch (err) {
        console.warn('membership banner fetch failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const view = useMemo(() => classify(membership?.expiresAt, membership?.active), [membership]);
  if (loading || !view || !membership?.tier) return null;

  const isExpired = view.tone === 'expired';
  const container = isExpired
    ? 'border-rose-300 bg-rose-50/60 text-rose-900'
    : 'border-amber-300 bg-amber-50/60 text-amber-900';
  const Icon = isExpired ? AlertTriangle : CalendarClock;

  return (
    <div className={`mb-6 flex flex-col gap-3 rounded-[20px] border px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between ${container}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden />
        <div>
          <div className="text-sm font-bold uppercase tracking-wide">
            {isExpired ? 'Membership expired' : `Membership expires in ${view.daysLeft} day${view.daysLeft === 1 ? '' : 's'}`}
          </div>
          <p className="mt-1 text-sm leading-relaxed">
            Your <span className="font-semibold">{membership.tier}</span> plan
            {isExpired ? ' expired on ' : ' renews on '}
            <span className="font-semibold">{formatDate(view.expiresAt)}</span>. Renew now to keep meeting credits and access to recommended matches.
          </p>
        </div>
      </div>
      <Link
        href="/membership/plans"
        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#7b102d] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#65001a]"
      >
        <ShieldCheck size={16} aria-hidden /> Renew Membership
      </Link>
    </div>
  );
}
