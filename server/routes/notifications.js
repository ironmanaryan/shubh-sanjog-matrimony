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

// POST /api/notifications/read — mark notifications as read.
// Body: { id } for one notification, { all: true } to mark everything read.
// Idempotent: already-read rows are skipped by the `read_at is null` filter.
router.post('/read', verifyTokenMiddleware, async (req, res) => {
  try {
    if (!db._db) return res.json({ ok: true, updated: 0 });
    const { id, all } = req.body || {};
    const updated = await db.markNotificationsReadDb(db._db, req.user.id, all ? null : id || null);
    return res.json({ ok: true, updated });
  } catch (err) {
    console.error('mark notifications read', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// DELETE /api/notifications — permanently remove notifications.
// Body/query: { id } deletes one, { all: true } clears everything.
// Always scoped to the authenticated user — nobody can delete another user's rows.
router.delete('/', verifyTokenMiddleware, async (req, res) => {
  try {
    if (!db._db) return res.json({ ok: true, deleted: 0 });
    const id = (req.body && req.body.id) || req.query.id || null;
    const all = Boolean((req.body && req.body.all) || req.query.all);
    const deleted = await db.deleteNotificationsDb(db._db, req.user.id, all ? null : id || null);
    return res.json({ ok: true, deleted });
  } catch (err) {
    console.error('delete notifications', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

module.exports = router;
