const express = require('express');
const router = express.Router();
const { createInquiry } = require('../controllers/inquiriesController');

// POST /api/inquiries — public Contact Us submissions (no auth required)
router.post('/', createInquiry);

module.exports = router;
