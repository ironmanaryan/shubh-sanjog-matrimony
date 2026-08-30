const express = require('express');
const router = express.Router();
const { sendOtp, verifyOtp, supabaseSession } = require('../controllers/authController');

// POST /api/auth/send-otp
router.post('/send-otp', sendOtp);

// POST /api/auth/verify-otp
router.post('/verify-otp', verifyOtp);

// POST /api/auth/supabase-session — exchange a Supabase access token
// (Google OAuth / email OTP) for the platform JWT used by every other endpoint.
router.post('/supabase-session', supabaseSession);

module.exports = router;
