'use client';

/**
 * useRealtimeNotifications — Supabase Realtime + polling backup.
 *
 * Strategy:
 *  1. Subscribe to `postgres_changes` INSERT on the `notifications` table via
 *     the user's own Supabase session (RLS filters to their rows only).
 *  2. Poll `GET /api/notifications` every 30s as a safety net (realtime drop,
 *     server restarts, pg_cron inserts landing before the channel re-attaches).
 *  3. Expose `markRead(id?)` → POST /api/notifications/read.
 *  4. Expose `deleteNotification(id)` / `deleteAll()` → DELETE /api/notifications
 *     (optimistic — the row disappears immediately, server reconciles).
 *
 * Returns { notifications, unreadCount, loading, error, connected, refresh, markRead, deleteNotification, deleteAll }.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { getAuthToken } from '@/lib/session-bridge';

export type RealtimeNotification = {
  id: string;
  toUserId?: string;
  to_user_id?: string;
  fromUserId?: string;
  from_user_id?: string;
  type: string;
  payload?: string | Record<string, unknown> | null;
  at: number;
  readAt?: number | null;
  read_at?: number | null;
};

/** payload is a JSON string (or already an object) — normalize to an object. */
export function parseNotificationPayload(payload: RealtimeNotification['payload']): Record<string, unknown> {
  if (!payload) return {};
  if (typeof payload === 'object') return payload as Record<string, unknown>;
  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** UI metadata per event type (mirrors server/utils/notify.js). */
export const NOTIFICATION_UI: Record<
  string,
  { title: string; message: string; icon: string; color: string }
> = {
  registration: {
    title: 'Welcome to Shubh Sanjog! 🎉',
    message: 'Your account is ready. Complete your biodata to get verified matches.',
    icon: 'welcome',
    color: '#7b102d',
  },
  profile_submitted: {
    title: 'Profile Submitted',
    message: 'Your biodata has been submitted for review.',
    icon: 'profile',
    color: '#8a5a11',
  },
  profile_approved: {
    title: 'Profile Approved ✅',
    message: 'Your profile is now Verified. You will start receiving matches.',
    icon: 'profile',
    color: '#0a7d4c',
  },
  profile_rejected: {
    title: 'Profile Rejected',
    message: 'Your profile needs changes. Check the review note.',
    icon: 'profile',
    color: '#9b1f2f',
  },
  document_approved: {
    title: 'Document Approved ✅',
    message: 'Your document has been verified successfully.',
    icon: 'document',
    color: '#0a7d4c',
  },
  document_rejected: {
    title: 'Document Rejected',
    message: 'There was an issue with your document. Please re-upload.',
    icon: 'document',
    color: '#9b1f2f',
  },
  membership_payment_successful: {
    title: 'Membership Payment Successful 💳',
    message: 'Payment received and verified.',
    icon: 'payment',
    color: '#0a7d4c',
  },
  payment_approved: {
    title: 'Payment Approved 💳',
    message: 'Your payment has been approved.',
    icon: 'payment',
    color: '#0a7d4c',
  },
  membership_activated: {
    title: 'Membership Activated 🎊',
    message: 'Your membership is now active. Enjoy your benefits!',
    icon: 'payment',
    color: '#0a7d4c',
  },
  payment_rejected: {
    title: 'Payment Rejected',
    message: 'We could not verify your payment. Check the reason and retry.',
    icon: 'payment',
    color: '#9b1f2f',
  },
  appointment_confirmed: {
    title: 'Appointment Confirmed ✅',
    message: 'Your appointment has been confirmed.',
    icon: 'appointment',
    color: '#0a7d4c',
  },
  appointment_reminder: {
    title: 'Appointment Reminder ⏰',
    message: 'Your appointment is tomorrow. Please arrive 10 minutes early.',
    icon: 'appointment',
    color: '#8a5a11',
  },
  appointment_rescheduled: {
    title: 'Appointment Rescheduled 📅',
    message: 'Your appointment has been rescheduled.',
    icon: 'appointment',
    color: '#8a5a11',
  },
  appointment_completed: {
    title: 'Appointment Completed',
    message: 'Your meeting is complete. Feedback has been recorded.',
    icon: 'appointment',
    color: '#5a3743',
  },
  appointment_cancelled: {
    title: 'Appointment Cancelled',
    message: 'Your appointment has been cancelled.',
    icon: 'appointment',
    color: '#9b1f2f',
  },
  new_match_assigned: {
    title: 'New Match Assigned 💕',
    message: 'A new match has been shared with you.',
    icon: 'match',
    color: '#c2185b',
  },
  interest_received: {
    title: 'Interest Received 👀',
    message: 'Someone showed interest in your profile.',
    icon: 'match',
    color: '#c2185b',
  },
  interest_accepted: {
    title: 'Interest Accepted 💕',
    message: 'Your interest was accepted!',
    icon: 'match',
    color: '#0a7d4c',
  },
  membership_expiry_reminder: {
    title: 'Membership Expiring Soon ⏳',
    message: 'Your membership is expiring soon. Renew now.',
    icon: 'payment',
    color: '#8a5a11',
  },
  generic: {
    title: 'Notification',
    message: 'You have a new update.',
    icon: 'info',
    color: '#7b102d',
  },
};

/** Resolve the caller's API token once per attempt (async bridge). */
async function resolveAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window === 'undefined') return {};
  const local = window.localStorage.getItem('token');
  const token = local || (await getAuthToken());
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useRealtimeNotifications(
  options: { userId?: string | null; pollingMs?: number } = {}
) {
  const { userId, pollingMs = 30_000 } = options;

  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── REST fetch (initial load + polling backup) ────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const headers = await resolveAuthHeaders();
      const res = await fetch('/api/notifications', { headers, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { notifications?: RealtimeNotification[] };
      if (mountedRef.current) {
        setNotifications(Array.isArray(json?.notifications) ? json.notifications : []);
        setError('');
      }
    } catch (e: unknown) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'Failed to load notifications');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // ── Realtime subscription (postgres_changes INSERT) ───────────────────────
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      // No Supabase configured — polling-only mode keeps the UI working.
      return;
    }

    let unsubscribed = false;
    const channel = supabase
      .channel(`notifications-${userId || 'anon'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const row = payload.new as RealtimeNotification | undefined;
          if (!row || !row.id) return;
          // RLS already scopes rows server-side; double-guard client-side.
          const rowUser = row.to_user_id || row.toUserId;
          if (userId && rowUser && rowUser !== userId) return;
          if (mountedRef.current && !unsubscribed) {
            setNotifications((prev) => [row, ...prev.filter((n) => n.id !== row.id)]);
          }
        }
      )
      .subscribe((status) => {
        if (mountedRef.current) {
          if (status === 'SUBSCRIBED') setConnected(true);
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setConnected(false);
          }
        }
      });

    channelRef.current = channel;

    return () => {
      unsubscribed = true;
      channelRef.current = null;
      try {
        supabase.removeChannel(channel);
      } catch {
        /* channel already gone */
      }
    };
  }, [userId]);

  // ── Polling backup (also does the immediate first load) ───────────────────
  useEffect(() => {
    if (!pollingMs || pollingMs <= 0) return;
    void refresh();
    pollRef.current = setInterval(() => void refresh(), pollingMs);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [pollingMs, refresh]);

  // ── Mark read (optimistic, server reconciles) ─────────────────────────────
  const markRead = useCallback(async (id?: string) => {
    const now = Date.now();
    setNotifications((prev) =>
      prev.map((n) => {
        const isTarget = id ? n.id === id : true;
        const isUnread = !(n.readAt ?? n.read_at);
        return isTarget && isUnread ? { ...n, readAt: now, read_at: now } : n;
      })
    );
    try {
      const headers = { 'Content-Type': 'application/json', ...(await resolveAuthHeaders()) };
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers,
        body: JSON.stringify(id ? { id } : { all: true }),
      });
    } catch {
      // best-effort; the next poll reconciles
    }
  }, []);

  // ── Delete one (optimistic, server reconciles) ────────────────────────────
  const deleteNotification = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      const headers = { 'Content-Type': 'application/json', ...(await resolveAuthHeaders()) };
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ id }),
      });
    } catch {
      // best-effort; the next poll reconciles
    }
  }, []);

  // ── Delete all (optimistic, server reconciles) ────────────────────────────
  const deleteAll = useCallback(async () => {
    setNotifications([]);
    try {
      const headers = { 'Content-Type': 'application/json', ...(await resolveAuthHeaders()) };
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ all: true }),
      });
    } catch {
      // best-effort; the next poll reconciles
    }
  }, []);

  // ── Derived unread count ──────────────────────────────────────────────────
  const unreadCount = notifications.filter((n) => !(n.readAt ?? n.read_at)).length;

  return { notifications, unreadCount, loading, error, connected, refresh, markRead, deleteNotification, deleteAll };
}
