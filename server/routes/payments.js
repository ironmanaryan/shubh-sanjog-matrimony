const express = require('express');
const router = express.Router();
const { verifyTokenMiddleware } = require('../middleware/auth');
const { requireProfileStatus } = require('../middleware/onboarding');
const {
  createMulterForUser,
  getPlans,
  submitPayment,
  listMyPayments,
} = require('../controllers/paymentsController');

// Payments open once the biodata is complete enough to submit (PRD funnel:
// Select Consultation/Membership comes after Submit Profile / Admin Review).
const submittedOrBeyond = [requireProfileStatus('Submitted', 'Under Review', 'Approved')];

// wrapper to run multer per-request after verifyTokenMiddleware
function multerMiddleware(req, res, next) {
  const upload = createMulterForUser(req.user.id).single('file');
  upload(req, res, function (err) {
    if (err) return next(err);
    next();
  });
}

// GET /api/payments/plans — plan catalog + UPI destination
router.get('/plans', getPlans);

// POST /api/payments — submit manual UPI payment (UTR + receipt screenshot)
// for admin verification. Membership activates only after admin approval.
router.post('/', verifyTokenMiddleware, ...submittedOrBeyond, multerMiddleware, submitPayment);

// GET /api/payments/mine — the user's submitted payments and their statuses
router.get('/mine', verifyTokenMiddleware, listMyPayments);

module.exports = router;
