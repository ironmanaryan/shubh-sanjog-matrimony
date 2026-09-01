const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { verifyTokenMiddleware } = require('../middleware/auth');
const { createMulterForUser, uploadDocument, downloadDocument, listDocuments, signDocumentUrl, downloadSignedDocument, deleteDocument } = require('../controllers/documentsController');

// wrapper to run multer per-request after verifyTokenMiddleware
function multerMiddleware(req, res, next) {
  const upload = createMulterForUser(req.user.id).single('file');
  upload(req, res, function (err) {
    if (err) return next(err);
    next();
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
