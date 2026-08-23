const express = require('express');
const router = express.Router();
const { verifyTokenMiddleware } = require('../middleware/auth');
const { createMulterForUser, getPlans, submitPayment, listMyPayments } = require('../controllers/paymentsController');

// wrapper to run multer per-request after verifyTokenMiddleware
function multerMiddleware(req, res, next) {
  const upload = createMulterForUser(req.user.id).single('file');
  upload(req, res, function (err) {
    if (err) return next(err);
    next();
  });
}

// GET /api/payments/plans — plan catalog + UPI destination
router.get('/plans', verifyTokenMiddleware, getPlans);

// POST /api/payments — submit UPI payment (UTR + receipt) for verification
router.post('/', verifyTokenMiddleware, multerMiddleware, submitPayment);

// GET /api/payments/mine — the user's submitted payments and their statuses
router.get('/mine', verifyTokenMiddleware, listMyPayments);

module.exports = router;
