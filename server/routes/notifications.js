const express = require('express');
const router = express.Router();
const { verifyTokenMiddleware } = require('../middleware/auth');
const db = require('../db');

// GET /api/notifications - notifications for current user
router.get('/', verifyTokenMiddleware, async (req, res) => {
  try {
    if (db._db) {
      const rows = await db.getNotificationsDb(db._db, req.user.id);
      return res.json({ ok: true, notifications: rows });
    }
    return res.json({ ok: true, notifications: [] });
  } catch (err) {
    console.error('get notifications', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

module.exports = router;