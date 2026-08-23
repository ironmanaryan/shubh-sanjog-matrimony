const express = require('express');
const router = express.Router();
const { verifyTokenMiddleware } = require('../middleware/auth');
const { listSlots, listMyAppointments, bookAppointment } = require('../controllers/appointmentsController');

router.get('/slots', verifyTokenMiddleware, listSlots);
router.get('/my', verifyTokenMiddleware, listMyAppointments);
router.post('/book', verifyTokenMiddleware, bookAppointment);

module.exports = router;
