'use client';

/**
 * `/customer/notifications` — dedicated, full-page activity feed.
 *
 * Every activity the platform generates lands here as saved text:
 *   Registration • Profile Submitted/Approved/Rejected • Document
 *   Approved/Rejected • Membership Payment Successful • Membership Activated •
 *   Appointment Confirmed/Reminder/Rescheduled • New Match Assigned •
 *   Membership Expiry Reminder
 *
 * Features:
 *   • Realtime (Supabase postgres_changes) + 30s polling backup
 *   • Per-notification DELETE + "Clear all" (server-backed, optimistic UI)
 *   • Mark one / mark all read
 *   • Unread badge + Live indicator
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, BellRing, CheckCheck, Loader2, Radio, Trash2 } from 'lucide-react';
import { NotificationRow } from '@/components/customer/NotificationsPanel';
import { useRealtimeNotifications } from '@/lib/use-realtime-notifications';

function fullTimestamp(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function NotificationsPage() {
  // Realtime notifications are keyed on the PLATFORM user id (users.id) —
  // the session bridge caches it in localStorage (same source as the dashboard).
  const [platformUserId, setPlatformUserId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const cachedUser = JSON.parse(localStorage.getItem('shubhSanjogUser') || 'null');
      if (cachedUser?.id) setPlatformUserId(String(cachedUser.id));
    } catch {
      /* corrupted cache — realtime still works, RLS does the real scoping */
    }
  }, []);

  const {
    notifications,
    unreadCount,
    loading,
    error,
    connected,
    refresh,
    markRead,
    deleteNotification,
    deleteAll,
  } = useRealtimeNotifications({ userId: platformUserId, pollingMs: 30_000 });

  const total = notifications.length;

  return (
    <div className="min-h-screen bg-[#fdf8f2] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/customer"
              className="mb-2 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#8a5a11] transition hover:text-[#7b102d]"
            >
              <ArrowLeft size={12} /> Back to dashboard
            </Link>
            <h1 className="flex items-center gap-2 text-2xl font-black text-[#2c0d16] sm:text-3xl">
              {unreadCount > 0 ? (
                <span className="relative inline-flex">
                  <BellRing size={26} className="text-[#9b1f2f]" />
                  <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#9b1f2f] px-1 text-[10px] font-black text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                </span>
              ) : (
                <Bell size={26} className="text-[#5a3743]" />
              )}
              My Activity & Notifications
            </h1>
            <p className="mt-1 text-sm text-[#8a6a75]">
              Every update on your account is saved here — profile, documents, payments, appointments and matches.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {connected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#e9f7ef] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#0a7d4c]">
                <Radio size={10} /> Live
              </span>
            )}
            {loading && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b08a96]">
                <Loader2 size={12} className="animate-spin" /> Loading…
              </span>
            )}
          </div>
        </div>

        {/* Action bar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#f2d9a8] bg-white px-4 py-3 shadow-soft">
          <span className="text-xs font-bold uppercase tracking-wider text-[#5a3743]">
            {total} saved • {unreadCount} unread
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void refresh()}
              className="rounded-full bg-[#fffaf3] px-3 py-1.5 text-[11px] font-bold text-[#5a3743] transition hover:bg-[#fdf3dd]"
            >
              Refresh
            </button>
            {unreadCount > 0 && (
              <button
                onClick={() => void markRead()}
                className="inline-flex items-center gap-1 rounded-full border border-[#7b102d] bg-white px-3 py-1.5 text-[11px] font-bold text-[#7b102d] transition hover:bg-[#fdf3dd]"
              >
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
            {total > 0 && (
              <button
                onClick={() => {
                  if (window.confirm('Delete ALL notifications? This cannot be undone.')) void deleteAll();
                }}
                className="inline-flex items-center gap-1 rounded-full border border-[#e5c4c4] bg-white px-3 py-1.5 text-[11px] font-bold text-[#9b1f2f] transition hover:bg-[#fdeaea]"
              >
                <Trash2 size={12} /> Clear all
              </button>
            )}
          </div>
        </div>

        {/* Error banner (transient — next poll clears it) */}
        {error && (
          <div className="mb-4 rounded-2xl border border-[#f2c4c4] bg-[#fdeaea] px-4 py-3 text-xs font-semibold text-[#9b1f2f]">
            {error} — retrying automatically.
          </div>
        )}

        {/* Feed */}
        <ul className="space-y-3 text-sm text-[#5a3743]">
          {total === 0 ? (
            <li className="rounded-3xl border border-dashed border-[#e8d5c0] bg-white/60 p-10 text-center">
              <Bell size={32} className="mx-auto mb-3 text-[#d9bfae]" />
              <p className="text-sm font-bold text-[#6a4a57]">No activity yet</p>
              <p className="mt-1 text-xs text-[#8a6a75]">
                Registrations, profile reviews, document verification, payments, appointments and match
                assignments will all appear here the moment they happen.
              </p>
            </li>
          ) : (
            notifications.map((item) => (
              <li key={item.id} className="relative">
                <NotificationRow
                  item={item}
                  onMarkOne={(id) => void markRead(id)}
                  onDelete={(id) => void deleteNotification(id)}
                />
                <span className="pointer-events-none absolute bottom-2 right-14 text-[10px] font-medium text-[#c8a8b4]">
                  {fullTimestamp(item.at)}
                </span>
              </li>
            ))
          )}
        </ul>

        {total > 0 && (
          <p className="mt-4 text-center text-[10px] font-semibold uppercase tracking-wider text-[#b08a96]">
            Click a notification to mark it read • 🗑 deletes it permanently
          </p>
        )}
      </div>
    </div>
  );
}
