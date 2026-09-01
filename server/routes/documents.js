const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { verifyTokenMiddleware } = require('../middleware/auth');
const { createMulterForUser, uploadDocument, downloadDocument, listDocuments, signDocumentUrl, downloadSignedDocument, deleteDocument } = require('../controllers/documentsController');

/**
 * Multer wrapper that converts the library's Error objects into structured
 * JSON instead of letting them fall through to Express's default HTML
 * error page. The raw `next(err)` path used to be the source of the
 * "<title>Error</title> <pre>Internal Server Error</pre>" alert the
 * customer saw.
 *
 * Maps the most common rejection reasons to friendly messages:
 *   LIMIT_FILE_SIZE  → 413 "File too large"
 *   Unsupported mime → 415 "Unsupported file type"
 *   Anything else    → 400 with the underlying message
 */
function multerMiddleware(req, res, next) {
  const upload = createMulterForUser(req.user.id).single('file');
  upload(req, res, function (err) {
    if (!err) return next();
    let status = 400;
    let message = err.message || 'Upload rejected';

    if (err.code === 'LIMIT_FILE_SIZE' || /file too large/i.test(message)) {
      status = 413;
      message = 'File too large — please keep documents under the 5 MB limit.';
    } else if (/unsupported file type/i.test(message)) {
      status = 415;
      message = 'Unsupported file type. Upload a JPG, PNG, WEBP or PDF.';
    } else if (err.name === 'MulterError') {
      // other multer errors (LIMIT_PART_COUNT, LIMIT_UNEXPECTED_FILE, ...)
      message = `Upload rejected (${err.code || err.name}).`;
    }

    if (!res.headersSent) {
      return res.status(status).json({ success: false, error: message });
    }
    next(err);
  });
}

// POST /api/documents/upload (protected)
router.post('/upload', verifyTokenMiddleware, multerMiddleware, uploadDocument);

// GET /api/documents (protected) - list user's documents
router.get('/', verifyTokenMiddleware, listDocuments);

// DELETE /api/documents/:id (protected) — owner or staff can delete. Hard
// delete: removes from in-memory store, cloud backend, and `documents` table.
// Always audit-logged server-side (§31).
router.delete('/:id', verifyTokenMiddleware, deleteDocument);

// GET /api/documents/signed/:id?token=... — HMAC-signed short-lived access.
// NOTE: defined before '/:id' and matching two path segments so it can never be
// captured by the single-segment '/:id' route below.
router.get('/signed/:id', downloadSignedDocument);

// GET /api/documents/:id/sign (protected) — mint a signed URL for a private
// file. §30 self-data isolation is enforced INSIDE the controller via
// canAccessDocument() (owner / staff / privacy-released photograph), because a
// document id is not a user id — a param-vs-principal middleware here would
// wrongly 403 every legitimate owner request.
router.get('/:id/sign', verifyTokenMiddleware, signDocumentUrl);

// GET /api/documents/:id (protected) — same isolation contract as /sign.
router.get('/:id', verifyTokenMiddleware, downloadDocument);

module.exports = router;
