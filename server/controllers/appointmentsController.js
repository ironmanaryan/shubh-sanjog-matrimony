const { v4: uuidv4 } = require('uuid');
const { store, ensureMembership, applyUsage } = require('../data/store');
const db = require('../db');
const { writeAuditLog } = require('../utils/audit');

// Allowed appointment states that admins (and, for the customer-cancel path,
// customers themselves) can drive the booking into. Centralised so the
// customer-side mutation and the admin-side mutation cannot drift apart.
const ALLOWED_STATUSES = ['Booked', 'Completed', 'Cancelled'];

// Read actions are public to customer and admin alike; writes are split
// below. Both branches delegate to the same shared `setAppointmentStatusDb`
// (Supabase / SQLite) so storage parity is automatic.

const APPOINTMENT_SLOTS = [
  '09:00 AM',
  '10:30 AM',
  '12:00 PM',
  '02:00 PM',
  '03:30 PM',
  '05:00 PM',
];

function getAvailableSlots() {
  const today = new Date();
  const dates = Array.from({ length: 5 }, (_, i) => {
    const next = new Date(today);
    next.setDate(today.getDate() + i);
    const date = next.toISOString().slice(0, 10);
    return {
      date,
      day: next.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      slots: APPOINTMENT_SLOTS.map((time) => ({
        id: `${date}-${time}`,
        time,
        available: !Array.from(store.appointments.values()).some((a) => a.date === date && a.time === time),
      })),
    };
  });
  return dates;
}

async function listSlots(req, res) {
  try {
    return res.json({ ok: true, slots: getAvailableSlots() });
  } catch (err) {
    console.error('listSlots', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

async function listMyAppointments(req, res) {
  try {
    const userId = req.user.id;
    // The database is the source of truth; empty list is a valid answer.
    if (db.isReady()) {
      const rows = await db.listAppointments(db._db, userId);
      return res.json({ ok: true, appointments: (rows || []).sort((a, b) => new Date(a.date) - new Date(b.date)) });
    }

    const appointments = Array.from(store.appointments.values()).filter((a) => a.userId === userId).sort((a, b) => new Date(a.date) - new Date(b.date));
    return res.json({ ok: true, appointments });
  } catch (err) {
    console.error('listMyAppointments', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

async function bookAppointment(req, res) {
  try {
    const userId = req.user.id;
    const { date, time, type = 'Consultation', notes = '' } = req.body || {};

    if (!date || !time) return res.status(400).json({ ok: false, error: 'date and time required' });

    // Profile-status guard (PRD §3 funnel). Approved members get the full
    // booking surface (Consultation / Compatibility Call / Profile Review).
    // Reject unapproved profiles unless the requested session is the initial
    // Consultation call (the lead-in that the funnel explicitly allows before
    // admin review — `customer/appointments` shows a Calendar widget that's a
    // legitimate landing target from the public marketing site).
    const status = req.profile?.status || 'Draft';
    if (status !== 'Approved' && type !== 'Consultation') {
      return res.status(403).json({
        ok: false,
        error: 'Booking unlocks once your profile is approved by our team.',
        profileStatus: status,
      });
    }

    // Membership gate (scope PDF §9/§14): a paid Consultation or membership
    // meeting credit is required. Strictly from the persisted membership.
    const membership = ensureMembership(userId);
    if (!membership || membership.active === false) {
      return res.status(403).json({ ok: false, error: 'Book the Consultation package or a membership to schedule appointments.' });
    }
    if ((membership.meetingsLeft || 0) <= 0) {
      return res.status(403).json({ ok: false, error: 'No meetings left in your current plan.' });
    }

    // double-booking guard (scope PDF §14)
    const alreadyBooked = Array.from(store.appointments.values()).some((a) => a.date === date && a.time === time && a.status !== 'Cancelled');
    if (alreadyBooked) {
      return res.status(409).json({ ok: false, error: 'This slot is already booked. Please choose another time.' });
    }

    const booking = {
      id: uuidv4(),
      userId,
      date,
      time,
      type,
      notes,
      status: 'Booked',
      createdAt: Date.now(),
    };

    store.appointments.set(booking.id, booking);
    try {
      if (db.isReady()) {
        await db.saveAppointment(db._db, booking);
        const notification = {
          id: uuidv4(),
          toUserId: userId,
          fromUserId: userId,
          type: 'appointment_confirmed',
          payload: JSON.stringify({ appointmentId: booking.id, date, time }),
          at: Date.now(),
        };
        await db.saveNotificationDb(db._db, notification);
        store.notifications.unshift(notification);
      }
    } catch (e) {
      console.warn('db save appointment failed', e);
    }
    applyUsage(userId, { meetings: 1 });

    return res.json({ ok: true, booking, membership: store.memberships.get(userId) });
  } catch (err) {
    console.error('bookAppointment', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// Shared mutation kernel — keeps customer and admin code paths in lockstep.
// Both call into the same `setAppointmentStatusDb(...)` so the audit log
// captures every transition through one funnel.
async function transitionAppointment({ id, status, feedback, actor, req, allowOwnerCancel = false, reschedule = undefined }) {
  const booking = store.appointments.get(id);
  if (!booking) return { ok: false, statusCode: 404, error: 'Appointment not found' };
  if (status && !ALLOWED_STATUSES.includes(status)) {
    return { ok: false, statusCode: 400, error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` };
  }
  // Customers can only cancel their own booking; completion/feedback is
  // admin-driven. The admin branch skips this check.
  if (!actor.isAdmin && !(allowOwnerCancel && status === 'Cancelled' && booking.userId === actor.id)) {
    return { ok: false, statusCode: 403, error: 'Only staff can complete meetings or change them outside of cancellation' };
  }
  if (status && booking.status === status) return { ok: true, booking, statusCode: 200 };

  const previousDate = booking.date;
  const previousTime = booking.time;

  if (status) {
    booking.status = status;
    if (feedback !== undefined && feedback !== null) booking.feedback = feedback;
    if (status === 'Completed') booking.completedAt = Date.now();
  }

  // Reschedule: date/time move (admin-driven, customer cannot self-reschedule)
  const isReschedule = Boolean(reschedule && (reschedule.date || reschedule.time));
  if (isReschedule) {
    if (reschedule.date) booking.date = String(reschedule.date);
    if (reschedule.time) booking.time = String(reschedule.time);
  }
  store.appointments.set(id, booking);

  try {
    if (db.isReady()) {
      const opts = {};
      if (feedback !== undefined && feedback !== null) opts.feedback = feedback;
      if (reschedule && (reschedule.date || reschedule.time)) opts.reschedule = { date: booking.date, time: booking.time };
      await db.setAppointmentStatusDb(db._db, id, status || booking.status, opts);

      const notificationType = isReschedule
        ? 'appointment_rescheduled'
        : status === 'Completed' ? 'appointment_completed' : status === 'Cancelled' ? 'appointment_cancelled' : 'appointment_updated';
      const notification = {
        id: uuidv4(),
        toUserId: booking.userId,
        fromUserId: actor.id,
        type: notificationType,
        payload: JSON.stringify({
          appointmentId: id,
          feedback: feedback || null,
          status: status || booking.status,
          ...(isReschedule ? { previousDate, previousTime, date: booking.date, time: booking.time } : {}),
        }),
        at: Date.now(),
      };
      await db.saveNotificationDb(db._db, notification);
      store.notifications.unshift(notification);
    }
  } catch (e) {
    console.warn('db set appointment status failed', e);
  }

  try {
    await writeAuditLog({
      actorId: actor.id,
      action: 'UPDATE_STATUS',
      targetUserId: booking.userId,
      ip: (req && req.headers && req.headers['x-forwarded-for']) || (req && req.ip) || '',
      detail: `${actor.identifier || actor.id} ${isReschedule ? 'rescheduled' : 'set'} appointment ${id} (${booking.date} ${booking.time}) -> ${status || booking.status}${feedback ? ` with feedback "${String(feedback).slice(0, 240)}"` : ''}`,
    });
  } catch (e) { /* audit log is non-fatal */ }

  return { ok: true, booking, statusCode: 200 };
}

// POST /api/appointments/status — customer-side self-service.
// Allowed action set is intentionally narrow: cancellation only.
// Completion + feedback are admin-driven so the operator owns meeting outcomes.
async function updateOwnAppointmentStatus(req, res) {
  try {
    const userId = req.user.id;
    const { id, action, feedback } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });
    if (action !== 'cancel') return res.status(400).json({ ok: false, error: 'Customers may only cancel appointments' });

    const result = await transitionAppointment({
      id,
      status: 'Cancelled',
      feedback,
      actor: { id: userId, identifier: req.user.identifier || userId },
      req,
      allowOwnerCancel: true,
    });
    if (!result.ok) return res.status(result.statusCode).json({ ok: false, error: result.error });
    return res.json({ ok: true, booking: result.booking });
  } catch (err) {
    console.error('updateOwnAppointmentStatus', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// POST /api/admin/appointments/status — staff-driven transition.
// `action` is one of 'complete' | 'cancel' | 'submit_feedback' | 'reschedule'.
// 'reschedule' carries `date` + `time` and keeps status as-is.
async function adminUpdateAppointmentStatus(req, res) {
  try {
    const { id, action, feedback, date, time } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });
    let status;
    let reschedule;
    switch (action) {
      case 'complete': status = 'Completed'; break;
      case 'cancel': status = 'Cancelled'; break;
      case 'submit_feedback': status = 'Completed'; break; // completing + tagging feedback in one shot
      case 'reschedule':
        // date/time required; status stays as-is (Booked)
        if (!date || !time) return res.status(400).json({ ok: false, error: 'date and time required for reschedule' });
        reschedule = { date: String(date), time: String(time) };
        status = undefined; // no status change
        break;
      default: return res.status(400).json({ ok: false, error: 'action must be complete|cancel|submit_feedback|reschedule' });
    }

    const result = await transitionAppointment({
      id,
      status,
      feedback,
      actor: { id: req.user.id, identifier: req.user.identifier || req.user.id, isAdmin: true },
      req,
    });
    if (!result.ok) return res.status(result.statusCode).json({ ok: false, error: result.error });
    return res.json({ ok: true, booking: result.booking });
  } catch (err) {
    console.error('adminUpdateAppointmentStatus', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// GET /api/admin/appointments — every appointment across all customers, newest
// first so the queue can render chronological. Staff-visible per §29.
async function listAllAppointments(_req, res) {
  try {
    let rows = [];
    if (db.isReady()) {
      try { rows = await db.listAppointments(db._db, null); } catch (e) { console.warn('listAllAppointments db read failed', e); }
    }
    if (!rows || rows.length === 0) {
      rows = Array.from(store.appointments.values()).map((b) => ({ ...b }));
    }
    // Hydrate display name + identifier from the cache so the panel reads
    // "Aarav Sharma — aarav@example.com" instead of a raw UUID.
    const enriched = rows
      .map((row) => {
        const cached = store.profiles.get(row.userId) || null;
        const personal = cached?.personal || {};
        const user = store.users.get(row.userId);
        return {
          ...row,
          customerName: personal.firstName ? `${personal.firstName} ${personal.lastName || ''}`.trim() : user?.identifier || row.userId,
          customerIdentifier: user?.identifier || '',
        };
      })
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.time || '').localeCompare(String(a.time || '')));

    return res.json({ ok: true, appointments: enriched });
  } catch (err) {
    console.error('listAllAppointments', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = {
  listSlots,
  listMyAppointments,
  bookAppointment,
  updateOwnAppointmentStatus,
  adminUpdateAppointmentStatus,
  listAllAppointments,
};
