'use client';

/**
 * NotificationsPanel — live customer notification feed.
 *
 * • Realtime: Supabase postgres_changes INSERT subscription (hook handles it)
 * • Polling backup every 30s
 * • Unread count badge + "Mark all read"
 * • Per-event icons/colours (registration, profile, documents, payments,
 *   appointments, matches, reminders)
 */

import { useMemo } from 'react';
import { Bell, BellRing, CheckCheck, Loader2, Radio } from 'lucide-react';
import {
  NOTIFICATION_UI,
  parseNotificationPayload,
  useRealtimeNotifications,
  type RealtimeNotification,
} from '@/lib/use-realtime-notifications';

const ICON_BG: Record<string, string> = {
  welcome: 'bg-[#f7e6ee] text-[#7b102d]',
  profile: 'bg-[#fdf3dd] text-[#8a5a11]',
  document: 'bg-[#e8f0fd] text-[#1d4ed8]',
  payment: 'bg-[#e9f7ef] text-[#0a7d4c]',
  appointment: 'bg-[#fdf3dd] text-[#8a5a11]',
  match: 'bg-[#fde8f1] text-[#c2185b]',
  info: 'bg-[#f1e9e2] text-[#5a3743]',
};

const ICON_GLYPH: Record<string, string> = {
  welcome: '🎉',
  profile: '📋',
  document: '📄',
  payment: '💳',
  appointment: '📅',
  match: '💕',
  info: '🔔',
};

function timeAgo(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function renderRow(item: RealtimeNotification, onMarkOne: (id: string) => void) {
  const payload = parseNotificationPayload(item.payload);
  const meta = NOTIFICATION_UI[item.type] || NOTIFICATION_UI.generic;
  const title = (payload.title as string) || meta.title;
  const message = (payload.message as string) || meta.message;
  const read = Boolean(item.readAt ?? item.read_at);

  // Extra context lines — appointment date/time, rejection reason, plan
  const extras: string[] = [];
  if (payload.date) extras.push(`${payload.date}${payload.time ? ` • ${payload.time}` : ''}`);
  if (payload.reason) extras.push(`Reason: ${payload.reason}`);
  if (payload.plan) extras.push(`Plan: ${payload.plan}`);

  return (
    <li
      key={item.id}
      onClick={() => !read && onMarkOne(item.id)}
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition ${
        read
          ? 'border-transparent bg-[#fffaf3] opacity-80'
          : 'border-[#f2d9a8] bg-white shadow-sm hover:bg-[#fff7ee]'
      }`}
    >
      <span
        className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${ICON_BG[meta.icon] || ICON_BG.info}`}
        style={meta.color && !read ? { boxShadow: `inset 0 0 0 2px ${meta.color}22` } : undefined}
      >
        {ICON_GLYPH[meta.icon] || ICON_GLYPH.info}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={`truncate text-sm font-bold ${read ? 'text-[#6a4a57]' : 'text-[#2c0d16]'}`}>{title}</span>
          {!read && <span className="h-2 w-2 shrink-0 rounded-full bg-[#9b1f2f]" aria-label="unread" />}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-[#5a3743]">{message}</span>
        {extras.length > 0 && (
          <span className="mt-1 block truncate text-[11px] font-semibold text-[#8a5a11]">{extras.join(' • ')}</span>
        )}
        <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider text-[#b08a96]">
          {timeAgo(item.at)}
        </span>
      </span>
    </li>
  );
}

export default function NotificationsPanel({
  userId,
  initialNotifications = [],
  maxVisible = 8,
}: {
  userId?: string | null;
  initialNotifications?: RealtimeNotification[];
  maxVisible?: number;
}) {
  const { notifications, unreadCount, loading, connected, refresh, markRead } = useRealtimeNotifications({
    userId,
    pollingMs: 30_000,
  });

  const items = useMemo(() => {
    const base = notifications.length > 0 ? notifications : initialNotifications;
    return base.slice(0, maxVisible);
  }, [notifications, initialNotifications, maxVisible]);

  return (
    <div id="notifications" className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {unreadCount > 0 ? (
            <span className="relative inline-flex">
              <BellRing size={20} className="text-[#9b1f2f]" />
              <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#9b1f2f] px-1 text-[10px] font-black text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </span>
          ) : (
            <Bell size={20} className="text-[#5a3743]" />
          )}
          <h2 className="text-xl font-black text-[#2c0d16]">Notifications</h2>
          {connected && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#e9f7ef] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0a7d4c]">
              <Radio size={10} /> Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 size={14} className="animate-spin text-[#b08a96]" />}
          {unreadCount > 0 && (
            <button
              onClick={() => void markRead()}
              className="inline-flex items-center gap-1 rounded-full border border-[#7b102d] bg-white px-3 py-1 text-[11px] font-bold text-[#7b102d] transition hover:bg-[#fdf3dd]"
            >
              <CheckCheck size={12} /> Mark all read
            </button>
          )}
          <button
            onClick={() => void refresh()}
            className="rounded-full bg-[#fffaf3] px-3 py-1 text-[11px] font-bold text-[#5a3743] transition hover:bg-[#fdf3dd]"
          >
            Refresh
          </button>
        </div>
      </div>

      <ul className="space-y-3 text-sm text-[#5a3743]">
        {items.length === 0 ? (
          <li className="rounded-2xl bg-[#fffaf3] p-4 text-center text-xs text-[#8a6a75]">
            No notifications yet — you will see updates here the moment they happen.
          </li>
        ) : (
          items.map((item) => renderRow(item, (id) => void markRead(id)))
        )}
      </ul>

      {items.length > 0 && (
        <div className="mt-3 text-center text-[10px] font-semibold uppercase tracking-wider text-[#b08a96]">
          Showing latest {items.length} • click a notification to mark it read
        </div>
      )}
    </div>
  );
}
