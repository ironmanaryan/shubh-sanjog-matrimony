const express = require('express');
const router = express.Router();
const { sendOtp, verifyOtp } = require('../controllers/authController');

// POST /api/auth/send-otp
router.post('/send-otp', sendOtp);

// POST /api/auth/verify-otp
router.post('/verify-otp', verifyOtp);

module.exports = router;
