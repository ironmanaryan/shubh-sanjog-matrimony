/**
 * Central notification helper — Shubh Sanjog Matrimony
 *
 * Ek hi jagah se sab customer notifications jaati hai. Har event handler
 * (auth, profile, documents, payments, appointments, matches) `notifyUser()`
 * call karta hai instead of inline uuid + payload building.
 *
 * Delivery: Supabase `notifications` table (service-role client — RLS bypass)
 * + in-memory store mirror for the Express `/api/admin/activity-stream`.
 *
 * Realtime: browser `supabase.channel('notifications').on('postgres_changes')`
 * isko turant pick karta hai kyunki table `supabase_realtime` publication me hai.
 */

const { randomUUID } = require('crypto');

// ── Event catalog ────────────────────────────────────────────────────────────
// type → { title, message, icon, color } — UI (customer panel + bell) inhi
// types ko map karta hai. Naya event add karna ho to yaha add karo, UI
// automatically render kar dega.
const NOTIFICATION_EVENTS = {
  registration: {
    title: 'Welcome to Shubh Sanjog! 🎉',
    message: 'Your account is ready. Complete your biodata to get verified matches.',
    icon: 'welcome',
    color: '#7b102d',
  },
  profile_submitted: {
    title: 'Profile Submitted',
    message: 'Your biodata has been submitted for review. We will verify it within 24 hours.',
    icon: 'profile',
    color: '#8a5a11',
  },
  profile_approved: {
    title: 'Profile Approved ✅',
    message: 'Congratulations! Your profile is now Verified. You will start receiving matches.',
    icon: 'profile',
    color: '#0a7d4c',
  },
  profile_rejected: {
    title: 'Profile Rejected',
    message: 'Your profile needs changes before it can be verified. Check the review note.',
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
    message: 'There was an issue with your document. Please re-upload after checking the reason.',
    icon: 'document',
    color: '#9b1f2f',
  },
  membership_payment_successful: {
    title: 'Membership Payment Successful 💳',
    message: 'Payment received. Your membership will be activated after final verification.',
    icon: 'payment',
    color: '#0a7d4c',
  },
  payment_approved: {
    title: 'Payment Approved 💳',
    message: 'Your payment has been approved.',
    icon: 'payment',
  },
  membership_activated: {
    title: 'Membership Activated 🎊',
    message: 'Your membership is now active. Enjoy your exclusive benefits!',
    icon: 'payment',
    color: '#0a7d4c',
  },
  payment_rejected: {
    title: 'Payment Rejected',
    message: 'We could not verify your payment. Please check the rejection reason and retry.',
    icon: 'payment',
    color: '#9b1f2f',
  },
  appointment_confirmed: {
    title: 'Appointment Confirmed ✅',
    message: 'Your appointment has been confirmed. See you at the bureau!',
    icon: 'appointment',
    color: '#0a7d4c',
  },
  appointment_reminder: {
    title: 'Appointment Reminder ⏰',
    message: 'Reminder: Your appointment is tomorrow. Please arrive 10 minutes early.',
    icon: 'appointment',
    color: '8a5a11',
  },
  appointment_rescheduled: {
    title: 'Appointment Rescheduled 📅',
    message: 'Your appointment has been rescheduled. Check the new date & time.',
    icon: 'appointment',
    color: '#8a5a11',
  },
  appointment_completed: {
    title: 'Appointment Completed',
    message: 'Your meeting is complete. Feedback notes have been recorded.',
    icon: 'appointment',
  },
  appointment_cancelled: {
    title: 'Appointment Cancelled',
    message: 'Your appointment has been cancelled. You can book a new slot availability.',
    icon: 'appointment',
    color: '#9b1f2f',
  },
  new_match_assigned: {
    title: 'New Match Assigned 💕',
    message: 'A new match has been shared with you. Check your Matches section now!',
    icon: 'match',
    color: '#c2185b',
  },
  interest_received: {
    title: 'Interest Received 👀',
    message: 'Someone showed interest in your profile. View it in the Interests section.',
    icon: 'match',
    color: '#c2185b',
  },
  interest_accepted: {
    title: 'Interest Accepted 💕',
    message: 'Your interest was accepted! Time to connect further.',
    icon: 'match',
    color: '#0a7d4c',
  },
  membership_expiry_reminder: {
    title: 'Membership Expiring Soon ⏳',
    message: 'Your membership is expiring in a few days. Renew now to keep your benefits.',
    icon: 'payment',
    color: '#8a5a11',
  },
  generic: {
    title: 'Notification',
    message: 'You have a new update.',
    icon: 'info',
  },
};

// ── Server client ────────────────────────────────────────────────────────────
let cachedAdminClient = null;

function stripQuotes(value) {
  return typeof value === 'string' ? value.replace(/^["']|["']$/g, '').trim() : value;
}

function getNotifySupabase() {
  if (cachedAdminClient) return cachedAdminClient;
  const url = stripQuotes(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key =
    stripQuotes(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    stripQuotes(process.env.SUPABASE_SERVICE_KEY) ||
    stripQuotes(process.env.SUPABASE_SECRET_KEY);
  if (!url || !key) return null;
  try {
    const { createClient } = require('@supabase/supabase-js');
    cachedAdminClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (e) {
    console.warn('[notify] supabase client failed', e && e.message ? e.message : e);
    return null;
  }
  return cachedAdminClient;
}

function resolveToUserId(userId) {
  // Accepts a users.id OR a raw email/identifier; resolves to a users.id.
  if (!userId) return null;
  const value = String(userId).trim();
  if (value.includes('@')) {
    const { store } = require('../data/store');
    const match = Array.from(store.users.values()).find(
      (u) =>
        String(u.email || '').toLowerCase() === value.toLowerCase() ||
        String(u.identifier || '').toLowerCase() === value.toLowerCase()
    );
    return match ? match.id : null;
  }
  return value;
}

/**
 * notifyUser({ toUserId, fromUserId, type, payload, title, message })
 * → { ok, id } — never throws; notification failures must not break the
 * primary action (booking, approval, etc.).
 */
async function notifyUser(options = {}) {
  const { toUserId, fromUserId = null, type = 'generic', payload = {}, title, message } = options;

  const event = NOTIFICATION_EVENTS[type] || NOTIFICATION_EVENTS.generic;
  const finalTitle = title || event.title;
  const finalMessage = message || event.message;

  const resolvedUserId = resolveToUserId(toUserId);
  if (!resolvedUserId) {
    console.warn('[notify] no resolvable toUserId, skipping:', type);
    return { ok: false, reason: 'no-user' };
  }

  const row = {
    id: randomUUID(),
    to_user_id: resolvedUserId,
    from_user_id: fromUserId || resolvedUserId,
    type,
    // Enriched payload — UI ye fields directly dikhata hai
    payload: JSON.stringify({
      ...payload,
      title: finalTitle,
      message: finalMessage,
      icon: event.icon,
      color: event.color,
    }),
    at: Date.now(),
    read_at: null,
  };

  // 1) Persist via service-role client (bypasses RLS, works in prod + dev)
  const client = getNotifySupabase();
  if (client) {
    const { error } = await client.from('notifications').insert(row);
    if (error) {
      console.warn('[notify] supabase insert failed:', error.message);
      return { ok: false, reason: 'db-error' };
    }
  }

  // 2) Mirror into the in-memory store so /api/admin/activity-stream + admin
  //    Live Activity panel instantly see it without a DB round-trip.
  try {
    const { store } = require('../data/store');
    store.notifications.unshift({
      id: row.id,
      toUserId: row.to_user_id,
      fromUserId: row.from_user_id,
      type: row.type,
      payload: row.payload,
      at: row.at,
      readAt: null,
    });
    if (store.notifications.length > 500) store.notifications.length = 500;
  } catch (e) {
    /* store mirror is best-effort */
  }

  return { ok: true, id: row.id };
}

module.exports = { notifyUser, NOTIFICATION_EVENTS };
