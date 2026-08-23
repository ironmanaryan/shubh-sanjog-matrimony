const express = require('express');
const router = express.Router();
const { verifyTokenMiddleware } = require('../middleware/auth');
const { getStats } = require('../controllers/dashboardController');

router.get('/stats', verifyTokenMiddleware, getStats);

module.exports = router;
