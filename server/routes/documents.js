const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { verifyTokenMiddleware } = require('../middleware/auth');
const { createMulterForUser, uploadDocument, downloadDocument, listDocuments, signDocumentUrl, downloadSignedDocument } = require('../controllers/documentsController');

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

// GET /api/documents/signed/:id?token=... — HMAC-signed short-lived access.
// NOTE: defined before '/:id' and matching two path segments so it can never be
// captured by the single-segment '/:id' route below.
router.get('/signed/:id', downloadSignedDocument);

// GET /api/documents/:id/sign (protected) — mint a signed URL for a private file
router.get('/:id/sign', verifyTokenMiddleware, signDocumentUrl);

// GET /api/documents/:id (protected)
router.get('/:id', verifyTokenMiddleware, downloadDocument);

module.exports = router;
