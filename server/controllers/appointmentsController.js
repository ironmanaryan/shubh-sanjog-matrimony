const { v4: uuidv4 } = require('uuid');
const { store, ensureMembership, applyUsage } = require('../data/store');
const db = require('../db');

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
    if (db._db) {
      const rows = await db.listAppointments(db._db, userId);
      if (rows && rows.length) {
        return res.json({ ok: true, appointments: rows });
      }
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
      if (db._db) {
        await db.saveAppointment(db._db, booking);
        await db._db.run(
          `INSERT INTO notifications (id, toUserId, fromUserId, type, payload, at) VALUES (?, ?, ?, ?, ?, ?);`,
          [uuidv4(), userId, userId, 'appointment_confirmed', JSON.stringify({ appointmentId: booking.id, date, time }), Date.now()]
        );
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

module.exports = { listSlots, listMyAppointments, bookAppointment };
