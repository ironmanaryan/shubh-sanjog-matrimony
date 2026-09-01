const express = require('express');
const router = express.Router();
const { verifyTokenMiddleware } = require('../middleware/auth');
const { requireProfileStatus } = require('../middleware/onboarding');
const { listSlots, listMyAppointments, bookAppointment, updateOwnAppointmentStatus } = require('../controllers/appointmentsController');

// Profile-status guard (PRD §3 funnel). Approved members get the full
// booking surface; unapproved profiles are still allowed to book the
// initial Consultation call (the public marketing CTA deep-links to it).
// The `bookAppointment` controller inspects `req.profile.status` + the
// request body's `type` and rejects non-Consultation sessions from
// unapproved profiles with a 403 + `profileStatus` hint so the frontend
// can route the user back into the funnel.
const profileGuard = requireProfileStatus('Submitted', 'Under Review', 'Approved');

router.get('/slots', verifyTokenMiddleware, listSlots);
router.get('/my', verifyTokenMiddleware, listMyAppointments);
router.post('/book', verifyTokenMiddleware, profileGuard, bookAppointment);
// Customer-side self-service — cancellation only (admins drive completion
// + feedback via /api/admin/appointments/status).
router.post('/status', verifyTokenMiddleware, updateOwnAppointmentStatus);

module.exports = router;
