const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { store } = require('../data/store');
const db = require('../db');
const { signPayload, verifyPayload, DEFAULT_TTL_SECONDS } = require('../utils/signing');
const { isStaffRole } = require('../middleware/rbac');
const { writeAuditLog, clientIp } = require('../utils/audit');
const { uploadToCloudinary, deleteFromCloudinary, isCloudinaryConfigured } = require('../utils/cloudinary');
const paths = require('../paths');

// Privacy §31: whenever a staff member accesses a document that belongs to
// somebody else (receipts, IDs, photographs…), the access is audit-logged.
function auditStaffDocumentView(req, meta, via) {
  if (!req.user || meta.userId === req.user.id || !isStaffRole(req.user.role)) return;
  writeAuditLog({
    actorId: req.user.id,
    action: 'VIEW_DOCUMENT',
    targetUserId: meta.userId,
    ip: clientIp(req),
    detail: `staff viewed document ${meta.id} (${meta.documentType || 'file'}) via ${via}`,
  }).catch(() => {});
}

// Accepted document types — IDs, photographs and proofs. Kept strict so the
// upload endpoint cannot be used to store arbitrary executables.
const ALLOWED_DOCUMENT_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const ALLOWED_DOCUMENT_EXT = /\.(jpe?g|png|webp|pdf)$/i;

// configure multer storage per-user (used by the route wrapper)
function createMulterForUser(userId) {
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      // Root-anchored: __dirname is unreliable once bundled by Next.js.
      const base = path.join(paths.privateUploadsDir, userId);
      fs.mkdirSync(/* turbopackIgnore: true */ base, { recursive: true });
      cb(null, base);
    },
    filename: function (req, file, cb) {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
      cb(null, unique);
    },
  });

  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB cap — matches the payments uploader
    fileFilter(req, file, cb) {
      const okMime = ALLOWED_DOCUMENT_MIME.has(file.mimetype);
      const okExt = ALLOWED_DOCUMENT_EXT.test(file.originalname || '');
      if (!okMime || !okExt) {
        return cb(new Error('Unsupported file type. Upload a JPG, PNG, WEBP or PDF.'));
      }
      return cb(null, true);
    },
  });
}

// controller used by route: router.post('/upload', verifyTokenMiddleware, upload.single('file'), uploadDocument)
// Local disk + Supabase PostgreSQL are the canonical store. Cloudinary is
// optional — if configured, we replicate the file there AFTER responding to
// the browser so a slow Cloudinary round-trip can never abort the user-visible
// request (Vercel serverless functions have a 10 s ceiling on the hobby tier,
// and Cloudinary's auto-format/quality transformations can easily exceed it).
async function uploadDocument(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file was attached to the request. Pick a JPG, PNG, WEBP or PDF under 5 MB and try again.',
      });
    }
    const id = uuidv4();
    const docType = (req.body && req.body.documentType) ? String(req.body.documentType) : 'other';

    // Audit the upload BEFORE the network write — even a failed Cloudinary
    // call is interesting, and a rejected file is exactly what a privacy
    // compliance reviewer wants to see.
    writeAuditLog({
      actorId: req.user.id,
      action: 'UPLOAD_DOCUMENT',
      targetUserId: req.user.id,
      ip: clientIp(req),
      detail: `user uploaded ${docType}: ${req.file.originalname} (${req.file.size} bytes)`,
    }).catch(() => {});

    // Meta first — without Cloudinary so far. We respond to the browser BEFORE
    // the (potentially slow) Cloudinary round-trip; the CDN replication runs
    // in the background and updates the document row in place when complete.
    const meta = {
      id,
      userId: req.user.id,
      originalName: req.file.originalname,
      path: req.file.path,
      cloudinaryUrl: null,
      cloudinaryPublicId: null,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadedAt: Date.now(),
      status: 'Pending Review',
      documentType: docType,
    };
    store.documents.set(id, meta);

    // Persist to DB synchronously so the response is sourced from one place.
    try {
      if (db._db) await db.saveDocument(db._db, meta);
    } catch (e) {
      console.warn('db save document failed', e);
      // Storage write succeeded but DB write failed — surface as a structured
      // 500 with a specific message, so the front-end can show a retry hint
      // instead of treating this as a generic failure.
      return res.status(500).json({
        success: false,
        error: 'Document uploaded to storage but database save failed. Please retry.',
      });
    }

    // Respond immediately so a slow Cloudinary round-trip can never abort the
    // browser fetch (which on Vercel serverless is what produced the
    // "Request aborted" toast in production).
    res.json({
      success: true,
      ok: true,
      file: meta,
      record: meta,
    });

    // Background Cloudinary replication. Fire-and-forget so a Cloudinary
    // outage cannot block uploads; the persisted row already has
    // `path = req.file.path` so the document is fully usable without CDN.
    if (isCloudinaryConfigured()) {
      const localPath = req.file.path;
      const originalName = req.file.originalname;
      (async () => {
        try {
          const result = await uploadToCloudinary(localPath, `shubh-sanjog/documents/${docType}`);
          if (result && result.secure_url) {
            const updated = {
              ...store.documents.get(id),
              path: result.secure_url,
              cloudinaryUrl: result.secure_url,
              cloudinaryPublicId: result.public_id,
            };
            store.documents.set(id, updated);
            try {
              if (db._db) await db.saveDocument(db._db, updated);
            } catch (e) {
              console.warn('cloudinary metadata update failed', e?.message);
            }
            console.log(`[documents] cloudinary replication complete for ${originalName}`);
          }
        } catch (e) {
          console.warn('[documents] cloudinary replication failed (non-fatal):', e.message);
        }
      })();
    }
  } catch (err) {
    console.error('uploadDocument', err);
    return res.status(500).json({
      success: false,
      error: (err && err.message) ? err.message : 'Server error',
    });
  }
}

async function listDocuments(req, res) {
  try {
    const userId = req.user.id;
    const docs = [];
    for (const [id, meta] of store.documents.entries()) {
      if (meta.userId === userId) docs.push(meta);
    }
    return res.json({ success: true, ok: true, documents: docs });
  } catch (err) {
    console.error('listDocuments', err);
    return res.status(500).json({
      success: false,
      error: (err && err.message) ? err.message : 'Server error',
    });
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
    if (!meta) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    if (!canAccessDocument(req.user, meta)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    auditStaffDocumentView(req, meta, `GET /api/documents/${id}`);
    streamDocument(meta, res);
  } catch (err) {
    console.error('downloadDocument', err);
    return res.status(500).json({
      success: false,
      error: (err && err.message) ? err.message : 'Server error',
    });
  }
}

function streamDocument(meta, res) {
  // If Cloudinary URL is present, redirect to the Cloudinary CDN (signed/private)
  if (meta.cloudinaryUrl && /^https?:\/\//.test(meta.cloudinaryUrl)) {
    return res.redirect(302, meta.cloudinaryUrl);
  }
  if (meta.path && /^https?:\/\//.test(meta.path)) {
    return res.redirect(302, meta.path);
  }
  res.setHeader('Content-Type', meta.mimetype || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${meta.originalName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  // Local file may have been cleaned up after Cloudinary upload — guard
  if (!meta.path || !fs.existsSync(meta.path)) {
    return res.status(404).json({ ok: false, error: 'File not found on server' });
  }
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
    if (!meta) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    if (!canAccessDocument(req.user, meta)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    auditStaffDocumentView(req, meta, 'GET /api/documents/:id/sign');

    const token = signPayload({ docId: id, userId: req.user.id, purpose: 'document-download' });
    const expiresAt = Date.now() + DEFAULT_TTL_SECONDS * 1000;
    // Absolute URL so it can be used directly in <img src> / browser downloads.
    const base = `${req.protocol}://${req.get('host')}`;
    return res.json({
      success: true,
      ok: true,
      url: `${base}/api/documents/signed/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,
      path: `/api/documents/signed/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,
      expiresAt,
    });
  } catch (err) {
    console.error('signDocumentUrl', err);
    return res.status(500).json({
      success: false,
      error: (err && err.message) ? err.message : 'Server error',
    });
  }
}

// GET /api/documents/signed/:id?token=... — no JWT; validates HMAC signature,
// expiry, and that the token was issued for exactly this document.
async function downloadSignedDocument(req, res) {
  try {
    const { id } = req.params;
    const payload = verifyPayload(String(req.query.token || ''));
    if (!payload || payload.purpose !== 'document-download' || payload.docId !== id) {
      return res.status(403).json({ success: false, error: 'Invalid or expired signature' });
    }
    const meta = store.documents.get(id);
    if (!meta) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    // Signed URLs are only ever minted after an authorization check for this
    // grantee — re-verify defensively so a stale grant cannot outlive a revoke.
    const grantee = store.users.get(payload.userId);
    if (grantee && !canAccessDocument(grantee, meta)) {
      return res.status(403).json({ success: false, error: 'Access revoked' });
    }
    if (grantee && meta.userId !== grantee.id && isStaffRole(grantee.role)) {
      writeAuditLog({
        actorId: grantee.id,
        action: 'VIEW_DOCUMENT',
        targetUserId: meta.userId,
        ip: clientIp(req),
        detail: `staff consumed signed URL for document ${meta.id} (${meta.documentType || 'file'})`,
      }).catch(() => {});
    }
    streamDocument(meta, res);
  } catch (err) {
    console.error('downloadSignedDocument', err);
    return res.status(500).json({
      success: false,
      error: (err && err.message) ? err.message : 'Server error',
    });
  }
}

/**
 * Best-effort delete of a document's backing store. Supabase Storage path or
 * Cloudinary public id — whichever the metadata carries. Failure here is
 * non-fatal (the database row still goes away), but we surface it so the audit
 * trail records whatever actually happened.
 */
async function purgeBackingStore(meta) {
  if (!meta) return null;
  const tried = [];

  // Cloudinary is the primary backend; the public id is what the delete call
  // needs. Server-side credentials so we never leak through the browser.
  if (meta.cloudinaryPublicId && isCloudinaryConfigured()) {
    try {
      const result = await deleteFromCloudinary(meta.cloudinaryPublicId);
      tried.push({ backend: 'cloudinary', ok: true, result });
    } catch (err) {
      tried.push({ backend: 'cloudinary', ok: false, error: err.message });
    }
  }

  // Local disk: only attempt if the metadata actually points at a file the
  // server has access to (i.e. NOT a Cloudinary URL pasted in).
  if (meta.path && !/^https?:\/\//.test(meta.path) && fs.existsSync(meta.path)) {
    try {
      await fs.promises.unlink(meta.path);
      tried.push({ backend: 'disk', ok: true });
    } catch (err) {
      tried.push({ backend: 'disk', ok: false, error: err.message });
    }
  }

  return tried.length ? tried : null;
}

/**
 * DELETE /api/documents/:id — owner or staff hard-delete. Always audited
 * (§31). Storage purge is best-effort; the DB row is the source of truth.
 */
async function deleteDocument(req, res) {
  try {
    const { id } = req.params;
    const meta = store.documents.get(id);
    if (!meta) {
      return res.status(404).json({ success: false, error: 'Document not found.' });
    }

    const isOwner = req.user && meta.userId === req.user.id;
    const staffOverride = req.user && isStaffRole(req.user.role);
    if (!isOwner && !staffOverride) {
      // Even denied attempts are interesting — log them.
      writeAuditLog({
        actorId: req.user?.id || null,
        action: 'DELETE_DOCUMENT',
        targetUserId: meta.userId,
        ip: clientIp(req),
        detail: `denied (not owner / not staff): tried to delete document ${id}`,
      }).catch(() => {});
      return res.status(403).json({ success: false, error: 'You can only delete your own documents.' });
    }

    const purgeResult = await purgeBackingStore(meta);
    const removed = store.documents.delete(id);
    let dbRemoved = 0;
    try {
      dbRemoved = await db.deleteDocument(db._db, id);
    } catch (e) {
      console.warn('db deleteDocument failed', e);
    }

    writeAuditLog({
      actorId: req.user.id,
      action: 'DELETE_DOCUMENT',
      targetUserId: meta.userId,
      ip: clientIp(req),
      detail: `${staffOverride && !isOwner ? 'staff' : 'owner'} deleted ${meta.documentType || 'document'} ${id} ${meta.originalName || ''}`.trim(),
    }).catch(() => {});

    return res.json({
      success: true,
      ok: true,
      removed: removed ? 1 : 0,
      purged: purgeResult || null,
      dbRowsRemoved: dbRemoved || 0,
    });
  } catch (err) {
    console.error('deleteDocument', err);
    return res.status(500).json({
      success: false,
      error: (err && err.message) ? err.message : 'Server error',
    });
  }
}

module.exports = { createMulterForUser, uploadDocument, listDocuments, downloadDocument, signDocumentUrl, downloadSignedDocument, deleteDocument, canAccessDocument };
