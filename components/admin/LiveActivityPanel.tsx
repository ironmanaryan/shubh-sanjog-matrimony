'use client';

/**
 * Live "Activity Logs & Document Verification" tab for the admin dashboard.
 *
 * Two surfaces in one card, separated by a thin divider:
 *   1) Top — counters + per-user activity sparkline. Auto-refreshes every
 *      8s so a duty admin walking in sees the current state without page
 *      reloads.
 *   2) Bottom — the existing inline Document Verification queue (Approve /
 *      Reject with rejection reason) for the most recent items. The full
 *      queue still lives on the dedicated Document Verification tab.
 *
 * Light-touch: relies on GET /api/admin/activity-stream and
 * GET /api/admin/documents, both already existed once we wired the new audit
 * actions in the backend.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BadgeCheck,
  CheckCircle2,
  CircleDashed,
  Image as ImageIcon,
  Loader2,
  RefreshCcw,
  ScrollText,
  ShieldCheck,
  Trash2,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { API } from '@/lib/api-base';

const REFRESH_MS = 8000;

type ActivityEvent = {
  id: string;
  action: string;
  detail?: string;
  targetUserId?: string | null;
  createdAt: number;
};

type CounterMap = Record<string, number>;

const ACTION_META: Record<string, { label: string; icon: typeof Activity; tone: string }> = {
  REGISTER_USER:        { label: 'New Registration',  icon: UserPlus,       tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  UPLOAD_DOCUMENT:      { label: 'Document Upload',   icon: ShieldCheck,    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  DELETE_DOCUMENT:      { label: 'Document Deleted',  icon: Trash2,         tone: 'bg-rose-50 text-rose-700 border-rose-200' },
  PROFILE_PHOTO_CHANGE: { label: 'Photo Updated',     icon: ImageIcon,      tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  PROFILE_UPDATE:       { label: 'Profile Updated',   icon: Activity,       tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  UPDATE_STATUS:        { label: 'Status Change',     icon: BadgeCheck,     tone: 'bg-slate-50 text-slate-700 border-slate-200' },
};

function relativeTime(ms: number) {
  const delta = Date.now() - ms;
  if (delta < 60_000) return `${Math.max(1, Math.floor(delta / 1000))}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

function badge(action: string) {
  return ACTION_META[action]?.tone || 'bg-slate-50 text-slate-700 border-slate-200';
}

function label(action: string) {
  return ACTION_META[action]?.label || action;
}

const IconFor = ({ action }: { action: string }) => {
  const Icon = ACTION_META[action]?.icon || Activity;
  return <Icon size={12} />;
};

type AdminDoc = {
  id: string;
  documentType?: string;
  originalName?: string;
  status?: string;
  uploadedAt?: number;
  customerName?: string;
  customerIdentifier?: string;
  rejectionReason?: string | null;
};

function statusTone(status?: string) {
  const s = String(status || '').toLowerCase();
  if (s.includes('approved')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s.includes('rejected')) return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

export default function LiveActivityPanel() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [counters, setCounters] = useState<CounterMap>({});
  const [latestDocs, setLatestDocs] = useState<AdminDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function authHeaders(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = authHeaders();
      if (!headers.Authorization) {
        setError('Sign in as admin to see live activity.');
        setLoading(false);
        return;
      }
      const [stream, docs] = await Promise.all([
        fetch(`${API}/admin/activity-stream?limit=50`, { headers }).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API}/admin/documents`, { headers }).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (stream?.ok) {
        setEvents(stream.events || []);
        setCounters(stream.counters || {});
      }
      if (docs?.ok) {
        const list = (docs.documents || []) as AdminDoc[];
        list.sort((a, b) => Number(b.uploadedAt || 0) - Number(a.uploadedAt || 0));
        setLatestDocs(list.slice(0, 8));
      }
      if (!stream?.ok && !docs?.ok) {
        setError('Could not load live activity — please refresh.');
      }
    } catch (e: any) {
      setError(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll, tick]);

  useEffect(() => {
    if (!autoRefresh) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh]);

  async function approveDoc(id: string) {
    const tokens = authHeaders();
    if (!tokens.Authorization) return;
    const headers = { ...tokens, 'Content-Type': 'application/json' };
    await fetch(`${API}/admin/documents/approve`, { method: 'POST', headers, body: JSON.stringify({ id }) });
    setTick((t) => t + 1);
  }

  async function rejectDoc(id: string) {
    const tokens = authHeaders();
    if (!tokens.Authorization) return;
    const headers = { ...tokens, 'Content-Type': 'application/json' };
    const reason = window.prompt('Rejection reason:') || '';
    if (!reason) return;
    await fetch(`${API}/admin/documents/reject`, { method: 'POST', headers, body: JSON.stringify({ id, reason }) });
    setTick((t) => t + 1);
  }

  const counterCards = useMemo(() => {
    const slots = [
      { key: 'REGISTER_USER', label: 'New registrations', icon: UserPlus, tone: 'border-indigo-200 bg-indigo-50/40 text-indigo-700' },
      { key: 'UPLOAD_DOCUMENT', label: 'Documents uploaded', icon: ShieldCheck, tone: 'border-emerald-200 bg-emerald-50/40 text-emerald-700' },
      { key: 'DELETE_DOCUMENT', label: 'Documents deleted', icon: Trash2, tone: 'border-rose-200 bg-rose-50/40 text-rose-700' },
      { key: 'PROFILE_PHOTO_CHANGE', label: 'Photo changes', icon: ImageIcon, tone: 'border-amber-200 bg-amber-50/40 text-amber-700' },
    ];
    return slots.map((s) => ({ ...s, value: counters[s.key] || 0 }));
  }, [counters]);

  return (
    <div className="space-y-5">
      {/* ── Counter cards ───────────────────────────────────────────────── */}
      <section className="rounded-[24px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="text-[#7b102d]" size={20} />
            <h2 className="text-xl font-black text-[#2c0d16]">Activity in the last 24 hours</h2>
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#e5c88d] px-3 py-1 text-xs font-semibold text-[#7b102d]">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="accent-[#7b102d]"
              />
              Auto-refresh ({(REFRESH_MS / 1000).toFixed(0)}s)
            </label>
            <button
              onClick={() => setTick((t) => t + 1)}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-full bg-[#7b102d] px-3 py-1 text-xs font-bold text-white hover:bg-[#601225] disabled:opacity-60"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {counterCards.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.key} className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm ${c.tone}`}>
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
                    <Icon size={14} /> {c.label}
                  </div>
                  <div className="mt-2 text-2xl font-black text-[#2c0d16]">{c.value}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Live activity stream ─────────────────────────────────────────── */}
      <section className="rounded-[24px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
        <div className="mb-3 flex items-center gap-2">
          <ScrollText className="text-[#7b102d]" size={18} />
          <h3 className="text-base font-black uppercase tracking-wide text-[#2c0d16]">Live activity stream</h3>
          <span className="ml-auto rounded-full bg-[#fbeeda] px-2 py-0.5 text-[10px] font-bold uppercase text-[#7b102d]">
            {events.length} events
          </span>
        </div>
        {events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#f2d9a8] bg-[#fffaf3] p-6 text-center text-sm text-[#5a3743]">
            <CircleDashed className="mx-auto mb-2 text-[#7b102d]" size={20} />
            No activity in the last 24 hours.
          </div>
        ) : (
          <ul className="divide-y divide-[#fbeeda]">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-3">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badge(e.action)}`}>
                  <IconFor action={e.action} /> {label(e.action)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-[#2c0d16]" title={e.detail || ''}>
                  {e.detail || '—'}
                </span>
                <span className="shrink-0 text-xs font-mono text-[#6a4a57]">{relativeTime(e.createdAt)}</span>
                {e.targetUserId && (
                  <span className="hidden max-w-[160px] truncate rounded-full bg-[#fbeeda] px-2 py-0.5 text-[10px] font-mono text-[#7b102d] md:inline" title={e.targetUserId}>
                    user {e.targetUserId.slice(0, 12)}…
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Inline document verification (last 8) ─────────────────────────── */}
      <section className="rounded-[24px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="text-[#7b102d]" size={18} />
          <h3 className="text-base font-black uppercase tracking-wide text-[#2c0d16]">Latest documents awaiting review</h3>
        </div>
        {latestDocs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#f2d9a8] bg-[#fffaf3] p-6 text-center text-sm text-[#5a3743]">
            Nothing waiting — the queue is clear.
          </div>
        ) : (
          <div className="space-y-3">
            {latestDocs.map((doc) => {
              const status = String(doc.status || 'Pending');
              return (
                <div key={doc.id} className="flex flex-col gap-2 rounded-2xl border border-[#f2d9a8] bg-[#fffaf3] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate font-bold text-[#2c0d16]" title={doc.originalName}>{doc.originalName || doc.id}</div>
                    <div className="mt-0.5 text-xs text-[#6a4a57]">
                      {doc.customerName || doc.customerIdentifier || doc.id} • {doc.documentType || 'document'} • {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : '—'}
                      {doc.rejectionReason ? ` • Rejected: ${doc.rejectionReason}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase ${statusTone(status)}`}>
                      {status.toLowerCase().includes('approved') ? <CheckCircle2 size={12} /> : status.toLowerCase().includes('rejected') ? <XCircle size={12} /> : <CircleDashed size={12} />}
                      {status}
                    </span>
                    {status.toLowerCase().includes('pending') && (
                      <>
                        <button onClick={() => approveDoc(doc.id)} className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700">Approve</button>
                        <button onClick={() => rejectDoc(doc.id)}  className="rounded-full bg-rose-600 px-3 py-1 text-xs font-bold text-white hover:bg-rose-700">Reject</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
