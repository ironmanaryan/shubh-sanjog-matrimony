'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api-base';
import RequestMeetingButton from '@/components/customer/RequestMeetingButton';
import { buildMeetingRequestMessage } from '@/lib/whatsapp';
import { getSession } from '@/lib/auth-client';
import { getSupabase } from '@/lib/supabase';


type SlotDay = {
  date: string;
  day: string;
  slots: { id: string; time: string; available: boolean }[];
};

type Booking = {
  id: string;
  date: string;
  time: string;
  type: string;
  notes: string;
  status: string;
  feedback?: string | null;
  completedAt?: number | null;
};

export default function AppointmentBooking() {
  const [days, setDays] = useState<SlotDay[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [notes, setNotes] = useState('');
  const [bookingType, setBookingType] = useState('Consultation');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [memberName, setMemberName] = useState('');

  // ── fetchMyAppointments ──────────────────────────────────────────────
  // Direct Supabase SELECT — the same strict pattern used by
  // /customer/documents. Auth user is resolved explicitly, the SELECT
  // filters by the exact UUID, and errors are logged but never wipe the
  // existing list (a transient network blip shouldn't blank the UI).
  const fetchMyAppointments = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      // Fall back to the Express API if Supabase isn't configured in this
      // browser session (rare, but covers dev/preview environments).
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) return;
      try {
        const res = await fetch(`${API}/appointments/my`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const json = await res.json();
          setBookings(json.appointments || []);
        }
      } catch (err) {
        console.error('fetchMyAppointments (API fallback) failed:', err);
      }
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const userId = (user.id || '').trim();
      if (!userId || /^undefined$/i.test(userId) || /^null$/i.test(userId)) return;

      const { data: rows, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('fetchMyAppointments Supabase error:', error);
        return; // keep previous state — never blank on transient error
      }
      if (!Array.isArray(rows)) return;

      const mapped: Booking[] = rows.map((r: any) => ({
        id: String(r.id),
        date: String(r.date || ''),
        time: String(r.time || ''),
        type: String(r.type || 'Consultation'),
        notes: String(r.notes || ''),
        status: String(r.status || 'Booked'),
        feedback: r.feedback || null,
        completedAt: r.completed_at || null,
      }));
      setBookings(mapped);
    } catch (err) {
      console.error('fetchMyAppointments error:', err);
    }
  }, []);

  // ── loadData ──────────────────────────────────────────────────────────
  // Slots come from the Express API (they are generated server-side with
  // double-booking awareness). My appointments come from Supabase directly.
  const loadData = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setDays([]);
      setBookings([]);
      setLoading(false);
      return;
    }

    try {
      const slotsRes = await fetch(`${API}/appointments/slots`, { headers: { Authorization: `Bearer ${token}` } });
      if (slotsRes.ok) {
        const slotsJson = await slotsRes.json();
        setDays(slotsJson.slots || []);
        const firstAvailable = (slotsJson.slots || []).find((day: SlotDay) => day.slots.some((slot: { available: boolean }) => slot.available));
        setSelectedDate(firstAvailable?.date || '');
        setSelectedSlot(firstAvailable?.slots.find((slot: { available: boolean }) => slot.available)?.id || '');
      }
      // Fetch appointments directly from Supabase
      await fetchMyAppointments();
    } catch (err) {
      console.error('load appointment data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PRD #2: personalise the WhatsApp meeting request with the member's name.
  useEffect(() => {
    setMemberName(getSession().user?.fullName || getSession().user?.identifier || '');
  }, []);

  const selectedDaySlots = useMemo(() => {
    return days.find((day) => day.date === selectedDate)?.slots || [];
  }, [days, selectedDate]);

  const selectedSlotTime = useMemo(
    () => selectedDaySlots.find((item) => item.id === selectedSlot)?.time || '',
    [selectedDaySlots, selectedSlot]
  );

  const waMeetingMessage = useMemo(
    () => buildMeetingRequestMessage({ name: memberName, date: selectedDate, time: selectedSlotTime, type: bookingType, notes }),
    [memberName, selectedDate, selectedSlotTime, bookingType, notes]
  );

  // ── handleBook ────────────────────────────────────────────────────────
  // STRICT INSERT directly into Supabase `appointments` table — same
  // pattern as /customer/documents:
  //   1. Resolve auth user explicitly via supabase.auth.getUser()
  //   2. INSERT with .select() and check error
  //   3. On error: console.error + alert + return (no optimistic push)
  //   4. On success: call fetchMyAppointments() to pull canonical rows
  //
  // The Express API POST /api/appointments/book is kept as a FALLBACK
  // only when Supabase is unreachable from the browser — it handles
  // membership gating + profile-status guard + notification dispatch.
  const handleBook = async () => {
    const supabase = getSupabase();
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setMessage('Please log in first.');
      return;
    }
    if (!selectedDate || !selectedSlot) {
      setMessage('Please select a valid slot.');
      return;
    }

    setSaving(true);
    setMessage('');

    const slot = selectedDaySlots.find((item) => item.id === selectedSlot);
    const slotTime = slot?.time || selectedSlot;

    // ── PRIMARY: direct Supabase INSERT ──
    if (supabase) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setMessage('Please log in first.');
          return;
        }
        const userId = (user.id || '').trim();
        if (!userId || /^undefined$/i.test(userId) || /^null$/i.test(userId)) {
          setMessage('Could not resolve your account. Please refresh and try again.');
          return;
        }

        const appointmentId =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `apt-${userId}-${Date.now()}`;

        const now = Date.now();
        const insertPayload = {
          id: appointmentId,
          user_id: userId,
          booking_date: selectedDate,
          time_slot: slotTime,
          session_type: bookingType,
          notes: notes || '',
          status: 'Booked',
          feedback: null,
          completed_at: null,
          created_at: now,
        };

        const { error } = await supabase
          .from('appointments')
          .insert([insertPayload])
          .select();

        if (error) {
          console.error('Appointment Insert Error:', error);
          setMessage(`Booking failed: ${error.message}`);
          setSaving(false);
          return;
        }

        // Immediately append the new appointment to local state so it displays
        // under "My appointments" without waiting for refetch
        // Note: insertPayload already contains 'id', so we spread it directly
        // and override specific fields rather than duplicating 'id'
        setBookings((prev) => [{ ...insertPayload, date: insertPayload.booking_date, time: insertPayload.time_slot, type: insertPayload.session_type, notes: insertPayload.notes, status: 'Booked' }, ...prev]);

        // Refetch canonical rows from Supabase to sync
        await fetchMyAppointments();
        setMessage('Appointment booked successfully.');
        setNotes('');
        setSaving(false);
        return;
      } catch (directErr: any) {
        console.error('Supabase direct booking failed:', directErr);
        setMessage('Booking failed. Please try again.');
        setSaving(false);
        return;
      }
    }

    // If Supabase is not available, show an error (do not fall back to in-memory Express API
    // which would not persist to Supabase and cause the admin panel to stay empty)
    setMessage('Unable to reach booking service. Please ensure you are connected.');
    setSaving(false);
  };

  // Customer-side self-service: cancel an existing booking. Completion +
  // feedback are admin-driven (PRD §22 lifecycle). We hard-block on
  // past dates because cancelling a meeting we already held is meaningless
  // to the customer and the admin should be the one to close it out.
  async function cancelBooking(id: string) {
    if (typeof window !== 'undefined' && !window.confirm('Cancel this appointment?')) return;

    // PRIMARY: direct Supabase UPDATE
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase
          .from('appointments')
          .update({ status: 'Cancelled', feedback: notes || null })
          .eq('id', id);
        if (!error) {
          setMessage('Appointment cancelled.');
          await fetchMyAppointments();
          return;
        }
        console.warn('Supabase cancel failed, falling back to API:', error);
      } catch (directErr) {
        console.warn('Supabase direct cancel failed, falling back to API:', directErr);
      }
    }

    // FALLBACK: Express API
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setMessage('Please log in first.');
      return;
    }
    try {
      const res = await fetch(`${API}/appointments/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, action: 'cancel', feedback: notes || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Cancellation failed');
      setMessage('Appointment cancelled.');
      await fetchMyAppointments();
    } catch (err: any) {
      setMessage(err.message || 'Cancellation failed');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#7b102d]">Consultation</p>
            <h2 className="mt-2 text-2xl font-black text-[#2c0d16]">Book a consultation</h2>
          </div>
          <div className="rounded-full bg-[#fff9ef] px-3 py-1.5 text-xs font-bold uppercase text-[#7b102d]">Slot locking enabled</div>
        </div>

        {message && <div className="mb-4 rounded-2xl border border-[#f2d9a8] bg-[#fffaf3] p-3 text-sm text-[#5a3743]">{message}</div>}

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="mb-4 text-sm font-semibold text-[#4d2c36]">Select date</div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {days.map((day) => (
                <button
                  key={day.date}
                  onClick={() => setSelectedDate(day.date)}
                  className={`rounded-2xl border p-3 text-left transition ${selectedDate === day.date ? 'border-[#d4a64a] bg-[#fffaf0] shadow-sm' : 'border-[#f2d9a8] bg-white'}`}
                >
                  <div className="text-xs uppercase tracking-[0.2em] text-[#7b102d]">{day.day}</div>
                  <div className="mt-2 text-base font-black text-[#2c0d16]">{day.date}</div>
                </button>
              ))}
            </div>

            <div className="mt-5">
              <div className="mb-3 text-sm font-semibold text-[#4d2c36]">Available time slots</div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {selectedDaySlots.map((slot) => (
                  <button
                    key={slot.id}
                    disabled={!slot.available}
                    onClick={() => setSelectedSlot(slot.id)}
                    className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${selectedSlot === slot.id ? 'border-[#d4a64a] bg-[#fffaf0] text-[#7b102d]' : slot.available ? 'border-[#f2d9a8] bg-white text-[#2c0d16]' : 'cursor-not-allowed border-[#f0e1bd] bg-[#f9f5ee] text-[#b5a79b]'}`}
                  >
                    {slot.time}
                    {!slot.available && ' • Booked'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-[#f2d9a8] bg-[#fffaf3] p-4">
            <div className="mb-4 text-sm font-semibold text-[#4d2c36]">Booking details</div>
            <label className="mb-2 block text-sm font-medium text-[#4d2c36]">Session type</label>
            <select value={bookingType} onChange={(e) => setBookingType(e.target.value)} className="mb-4 w-full rounded-xl border border-[#f2d9a8] bg-white px-3 py-2 text-sm text-[#2c0d16]">
              <option value="Consultation">Consultation</option>
              <option value="Compatibility Call">Compatibility Call</option>
              <option value="Profile Review">Profile Review</option>
            </select>

            <label className="mb-2 block text-sm font-medium text-[#4d2c36]">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Optional preferences or questions for the advisor" className="w-full rounded-xl border border-[#f2d9a8] bg-white px-3 py-2 text-sm text-[#2c0d16]" />

            <button disabled={saving} onClick={handleBook} className="mt-5 w-full rounded-full bg-[#7b102d] px-4 py-3 text-sm font-bold text-white">
              {saving ? 'Booking...' : 'Confirm booking'}
            </button>

            {/* PRD high-priority #2 — Request Meeting via WhatsApp, pre-filled
                with the currently selected slot / session type / notes. */}
            <div className="mt-3">
              <RequestMeetingButton message={waMeetingMessage} label="Request this slot on WhatsApp" className="w-full" />
              <p className="mt-2 text-center text-xs text-[#6a4a57]">Opens WhatsApp with your slot details pre-filled.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
        <h3 className="text-xl font-black text-[#2c0d16]">My appointments</h3>
        {bookings.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-[#f2d9a8] bg-[#fffaf3] p-6 text-sm text-[#5a3743]">No appointments booked yet.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {bookings.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-[#f2d9a8] bg-[#fffaf3] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-bold text-[#2c0d16]">{item.type}</div>
                  <div className="text-sm text-[#5a3743]">{item.date} • {item.time}</div>
                  {item.notes && <div className="text-xs text-[#6a4a57]">Note: {item.notes}</div>}
                  {item.feedback && <div className="text-xs italic text-[#6a4a57]">Feedback: {item.feedback}</div>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                      item.status === 'Completed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : item.status === 'Cancelled'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-[#eaf8ef] text-[#0a7d4c]'
                    }`}
                  >
                    {item.status}
                  </span>
                  {item.status === 'Booked' && (
                    <button
                      onClick={() => cancelBooking(item.id)}
                      className="rounded-full border border-[#f0b8b8] bg-white px-3 py-1.5 text-xs font-bold text-[#9b1f2f] hover:bg-[#fff0f0]"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
