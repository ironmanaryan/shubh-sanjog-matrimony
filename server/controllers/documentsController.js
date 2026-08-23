const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { store } = require('../data/store');
const db = require('../db');
const { signPayload, verifyPayload, DEFAULT_TTL_SECONDS } = require('../utils/signing');
const { isStaffRole } = require('../middleware/rbac');

// configure multer storage per-user (used by the route wrapper)
function createMulterForUser(userId) {
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const base = path.join(__dirname, '..', 'uploads', 'private', userId);
      fs.mkdirSync(base, { recursive: true });
      cb(null, base);
    },
    filename: function (req, file, cb) {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
      cb(null, unique);
    },
  });

  return multer({ storage });
}

// controller used by route: router.post('/upload', verifyTokenMiddleware, upload.single('file'), uploadDocument)
async function uploadDocument(req, res) {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'file is required' });
    const id = uuidv4();
    const docType = (req.body && req.body.documentType) ? String(req.body.documentType) : 'other';
    const meta = {
      id,
      userId: req.user.id,
      originalName: req.file.originalname,
      path: req.file.path,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadedAt: Date.now(),
      status: 'Pending Review',
      documentType: docType,
    };
    store.documents.set(id, meta);
    // persist to db
    try {
      if (db._db) await db.saveDocument(db._db, meta);
    } catch (e) {
      console.warn('db save document failed', e);
    }
    return res.json({ ok: true, file: meta });
  } catch (err) {
    console.error('uploadDocument', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

async function listDocuments(req, res) {
  try {
    const userId = req.user.id;
    const docs = [];
    for (const [id, meta] of store.documents.entries()) {
      if (meta.userId === userId) docs.push(meta);
    }
    return res.json({ ok: true, documents: docs });
  } catch (err) {
    console.error('listDocuments', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// Central access rule (scope PDF §30 data isolation): owner, staff roles, or a
// photograph released by the privacy rules (admin-approved profile or accepted
// interest — mirrors matchesController).
function canAccessDocument(user, meta) {
  if (!user || !meta) return false;
  if (meta.userId === user.id) return true;
  if (isStaffRole(user.role)) return true;
  if (meta.documentType !== 'photograph') return false;
  const targetProfile = store.profiles.get(meta.userId);
  const { getPrivacySettings } = require('../data/store');
  const privacy = getPrivacySettings(meta.userId);
  const accepted = store.interestRequests.some(
    (r) => r.status === 'Accepted' && ((r.fromUserId === user.id && r.toProfileId === meta.userId) || (r.fromUserId === meta.userId && r.toProfileId === user.id))
  );
  const revealBase = (targetProfile?.status === 'Approved') || accepted;
  return revealBase && !privacy.hidePhoto;
}

async function downloadDocument(req, res) {
  try {
    const { id } = req.params;
    const meta = store.documents.get(id);
    if (!meta) return res.status(404).json({ ok: false, error: 'File not found' });
    if (!canAccessDocument(req.user, meta)) {
      return res.status(403).json({ ok: false, error: 'Access denied' });
    }
    streamDocument(meta, res);
  } catch (err) {
    console.error('downloadDocument', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

function streamDocument(meta, res) {
  res.setHeader('Content-Type', meta.mimetype || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${meta.originalName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  const stream = fs.createReadStream(meta.path);
  stream.on('error', (err) => {
    console.error('stream error', err);
    res.status(500).end();
  });
  stream.pipe(res);
}

// GET /api/documents/:id/sign — issue a short-lived signed URL for a private
// file after enforcing the same access rules as the streaming endpoint. The
// returned URL works without an Authorization header (for <img>/<a> tags) but
// is bound to this file + grantee and expires quickly.
async function signDocumentUrl(req, res) {
  try {
    const { id } = req.params;
    const meta = store.documents.get(id);
    if (!meta) return res.status(404).json({ ok: false, error: 'File not found' });
    if (!canAccessDocument(req.user, meta)) {
      return res.status(403).json({ ok: false, error: 'Access denied' });
    }

    const token = signPayload({ docId: id, userId: req.user.id, purpose: 'document-download' });
    const expiresAt = Date.now() + DEFAULT_TTL_SECONDS * 1000;
    // Absolute URL so it can be used directly in <img src> / browser downloads.
    const base = `${req.protocol}://${req.get('host')}`;
    return res.json({
      ok: true,
      url: `${base}/api/documents/signed/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,
      path: `/api/documents/signed/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,
      expiresAt,
    });
  } catch (err) {
    console.error('signDocumentUrl', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// GET /api/documents/signed/:id?token=... — no JWT; validates HMAC signature,
// expiry, and that the token was issued for exactly this document.
async function downloadSignedDocument(req, res) {
  try {
    const { id } = req.params;
    const payload = verifyPayload(String(req.query.token || ''));
    if (!payload || payload.purpose !== 'document-download' || payload.docId !== id) {
      return res.status(403).json({ ok: false, error: 'Invalid or expired signature' });
    }
    const meta = store.documents.get(id);
    if (!meta) return res.status(404).json({ ok: false, error: 'File not found' });

    // Signed URLs are only ever minted after an authorization check for this
    // grantee — re-verify defensively so a stale grant cannot outlive a revoke.
    const grantee = store.users.get(payload.userId);
    if (grantee && !canAccessDocument(grantee, meta)) {
      return res.status(403).json({ ok: false, error: 'Access revoked' });
    }
    streamDocument(meta, res);
  } catch (err) {
    console.error('downloadSignedDocument', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = { createMulterForUser, uploadDocument, listDocuments, downloadDocument, signDocumentUrl, downloadSignedDocument, canAccessDocument };
