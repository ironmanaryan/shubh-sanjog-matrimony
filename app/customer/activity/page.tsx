'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BriefcaseBusiness,
  CalendarCheck2,
  FileText,
  Heart,
  Inbox,
  Sparkles,
  UserRound,
  Wallet,
} from 'lucide-react';
import { API } from '@/lib/api-client';

// Profile Activity (scope §13/§21): one chronological timeline of everything
// the customer did and everything that happened to their account — payments,
// appointments, documents, interests, profile review outcomes, match assigns.

type ActivityItem = { id: string; type: string; title: string; detail?: string; at: number };

const TYPE_ICONS: Record<string, typeof Activity> = {
  payment: Wallet,
  appointment: CalendarCheck2,
  document: FileText,
  interest: Heart,
  profile: UserRound,
  match: Sparkles,
};

const TYPE_STYLES: Record<string, string> = {
  payment: 'bg-[#fff1dc] text-[#8a5a11]',
  appointment: 'bg-[#e7f0ff] text-[#1d4ed8]',
  document: 'bg-[#eaf8ef] text-[#0a7d4c]',
  interest: 'bg-[#ffe9ef] text-[#9b1f2f]',
  profile: 'bg-[#f3e8ff] text-[#6d28d9]',
  match: 'bg-[#fff0cf] text-[#b45309]',
};

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export default function ActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API}/customer/activity`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load your activity right now.');
        const json = await res.json();
        setItems(json.items || []);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load your activity.'))
      .finally(() => setLoading(false));
  }, []);

  const visible = filter === 'all' ? items : items.filter((i) => i.type === filter);
  const availableTypes = Array.from(new Set(items.map((i) => i.type)));

  // Group by calendar day for the timeline headers.
  const groups: { label: string; items: ActivityItem[] }[] = [];
  for (const item of visible) {
    const label = dayLabel(item.at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
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
                <Activity size={22} className="text-[#7b102d]" /> Profile Activity
              </h1>
              <p className="mt-1 text-sm text-[#5a3743]">Everything you did and everything that happened to your account.</p>
            </div>
            <Link href="/customer" className="inline-flex items-center gap-2 rounded-full border border-[#e5c88d] bg-white px-4 py-2 text-sm font-semibold text-[#7b102d] transition hover:bg-[#fff7ee]">
              <ArrowLeft size={15} /> Back to dashboard
            </Link>
          </div>
        </div>

        {loadError && !loading && (
          <div className="mb-5 rounded-2xl border border-[#f3cccc] bg-[#fdf1f1] px-4 py-3 text-sm font-medium text-[#9b1f2f]">
            {loadError}
          </div>
        )}

        {/* Type filter */}
        {!loading && items.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {[{ key: 'all', label: 'All activity' }, ...availableTypes.map((t) => ({ key: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  filter === key ? 'bg-[#7b102d] text-white shadow-sm' : 'border border-[#e9d4a3] bg-white text-[#4d2c36] hover:bg-[#fff7ee]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Timeline */}
        {loading ? (
          <div className="rounded-[24px] border border-[#f2d8a8] bg-white p-5 text-sm text-[#5a3743] shadow-soft">Loading your activity…</div>
        ) : !tokenGuard() ? (
          <div className="rounded-[24px] border border-[#f2d9a8] bg-[#fffaf3] p-5 text-sm text-[#5a3743] shadow-soft">
            Please <Link href="/login" className="font-bold text-[#7b102d] underline">log in</Link> to view your activity.
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[24px] border border-dashed border-[#f2d9a8] bg-[#fffaf3] p-10 text-center text-sm text-[#5a3743] shadow-soft">
            <Inbox size={28} className="text-[#c9a86a]" />
            {items.length === 0 ? 'No activity yet — book a consultation or submit your biodata to get started.' : `No ${filter} activity found.`}
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.label}>
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-[#7b102d]">{group.label}</span>
                  <span className="h-px flex-1 bg-[#f2d9a8]" />
                </div>
                <ol className="space-y-3">
                  {group.items.map((item) => {
                    const Icon = TYPE_ICONS[item.type] || Activity;
                    const badge = TYPE_STYLES[item.type] || 'bg-[#f3f4f6] text-[#4b5563]';
                    return (
                      <li key={item.id} className="flex items-start gap-3 rounded-[20px] border border-[#f2d8a8] bg-white p-4 shadow-soft transition hover:border-[#e0bd7a]">
                        <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${badge}`}>
                          <Icon size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-[#2c0d16]">{item.title}</div>
                          {item.detail && <div className="mt-0.5 text-xs leading-5 text-[#6a4a57]">{item.detail}</div>}
                        </div>
                        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[#9a8290]">{timeLabel(item.at)}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Local helper so the JSX stays tidy — mirrors the token check in the effect.
function tokenGuard(): boolean {
  if (typeof window === 'undefined') return true;
  return Boolean(localStorage.getItem('token'));
}
