// Admin-only internal notes (scope PDF §31). Notes are stored in SQLite and
// are NEVER returned by any customer-facing API — only staff roles with the
// `addNotes` permission may read or write them.
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requirePermission, requireStaffRole } = require('../middleware/rbac');

const ALLOWED_TARGET_TYPES = ['profile', 'payment', 'document', 'customer', 'match_assignment', 'appointment'];

async function listNotes(req, res) {
  try {
    const targetType = String(req.query.targetType || '').trim();
    const targetId = req.query.targetId ? String(req.query.targetId).trim() : null;
    if (!ALLOWED_TARGET_TYPES.includes(targetType)) {
      return res.status(400).json({ ok: false, error: `targetType must be one of: ${ALLOWED_TARGET_TYPES.join(', ')}` });
    }
    let notes = [];
    if (db._db) notes = await db.listInternalNotesDb(db._db, targetType, targetId);
    return res.json({ ok: true, notes });
  } catch (error) {
    console.error('list internal notes error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

async function addNote(req, res) {
  try {
    const { targetType, targetId, note } = req.body || {};
    const trimmed = String(note || '').trim();
    if (!ALLOWED_TARGET_TYPES.includes(targetType)) {
      return res.status(400).json({ ok: false, error: `targetType must be one of: ${ALLOWED_TARGET_TYPES.join(', ')}` });
    }
    if (!targetId) return res.status(400).json({ ok: false, error: 'targetId required' });
    if (!trimmed) return res.status(400).json({ ok: false, error: 'note required' });

    const record = {
      id: uuidv4(),
      targetType,
      targetId,
      authorId: req.user.id,
      note: trimmed.slice(0, 2000),
      createdAt: Date.now(),
    };
    try {
      if (db._db) await db.saveInternalNoteDb(db._db, record);
    } catch (e) {
      console.warn('save internal note failed', e);
      return res.status(500).json({ ok: false, error: 'Could not save note' });
    }
    return res.status(201).json({ ok: true, note: { ...record, authorIdentifier: req.user.identifier } });
  } catch (error) {
    console.error('add internal note error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = { listNotes, addNote, ALLOWED_TARGET_TYPES };
