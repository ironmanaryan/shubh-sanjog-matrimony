const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { store, getPlan, activateMembership, UPI_CONFIG } = require('../data/store');
const db = require('../db');
const { writeAuditLog } = require('../utils/audit');
const { uploadToCloudinary, isCloudinaryConfigured } = require('../utils/cloudinary');

// Payments (PRD §5): MANUAL UPI ONLY — no third-party payment gateway.
//   1) Customer scans the business UPI QR (or pays to the UPI ID directly)
//   2) Customer submits UPI Txn ID / UTR + payment screenshot as proof
//   3) Payment is stored in MongoDB with status "Pending Verification"
//   4) Admin reviews the proof in Payment Management and clicks "Approve"
//   5) Approval automatically activates/extends the membership in MongoDB
// Canonical tiers (seeded into membership_plans on boot):
//   Consultation ₹599 · Gold ₹5,100 · Premium ₹11,000

function createMulterForUser(userId) {
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const base = path.join(__dirname, '..', 'uploads', 'receipts', userId);
      fs.mkdirSync(base, { recursive: true });
      cb(null, base);
    },
    filename: function (req, file, cb) {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
      cb(null, unique);
    },
  });

  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB cap for receipt uploads
  });
}

function publicPaymentView(payment) {
  return {
    id: payment.id,
    plan: payment.plan,
    amount: payment.amount,
    upiId: payment.upiId,
    utr: payment.utr,
    gateway: 'manual_upi',
    status: payment.status || 'Pending Verification',
    rejectionReason: payment.rejectionReason || null,
    receiptName: payment.receiptName || null,
    createdAt: payment.createdAt,
    reviewedAt: payment.reviewedAt,
  };
}

async function notifyUser(toUserId, type, payloadObj) {
  try {
    const notification = { id: uuidv4(), toUserId, fromUserId: toUserId, type, payload: JSON.stringify(payloadObj), at: Date.now() };
    await db.saveNotificationDb(db._db, notification);
    store.notifications.unshift(notification);
  } catch (e) {
    console.warn('notifyUser failed', e);
  }
}

async function resolvePlan(tier) {
  let plan = null;
  try { plan = await db.getPlanDb(db._db, tier); } catch (e) { console.warn('getPlanDb failed', e); }
  if (!plan) plan = getPlan(tier);
  return plan;
}

async function getPlans(req, res) {
  try {
    // Single source of truth: the membership_plans table/collection (seeded on boot).
    let plans = [];
    try { plans = await db.listMembershipPlansDb(db._db); } catch (e) { console.warn('listMembershipPlansDb failed', e); }
    return res.json({
      ok: true,
      upiId: UPI_CONFIG.upiId,
      payeeName: UPI_CONFIG.payeeName,
      plans,
      payments: { mode: 'manual_upi' },
    });
  } catch (err) {
    console.error('getPlans', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// POST /api/payments — multipart: plan, utr, file (receipt/screenshot)
// Saves the payment record with status "Pending Verification" until an admin
// verifies the UTR + proof and approves it.
async function submitPayment(req, res) {
  try {
    const userId = req.user.id;

    // Plan must come from the plans table (single source of truth)
    const plan = await resolvePlan(req.body?.plan);
    const utr = String(req.body?.utr || '').trim();

    if (!plan) return res.status(400).json({ ok: false, error: 'A valid membership plan is required' });
    if (!utr || utr.length < 6) return res.status(400).json({ ok: false, error: 'A valid UPI UTR / transaction reference id is required' });
    if (!req.file) return res.status(400).json({ ok: false, error: 'Payment receipt / screenshot upload is required' });
    if (!/^(jpe?g|png|webp|pdf)$/i.test(String(req.file.mimetype.split('/')[1] || ''))) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
      return res.status(400).json({ ok: false, error: 'Receipt must be an image or PDF' });
    }

    // block duplicate pending submissions for the same plan
    for (const existing of store.payments.values()) {
      if (existing.userId === userId && existing.plan === plan.tier && existing.status === 'Pending Verification') {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
        return res.status(409).json({ ok: false, error: `A ${plan.tier} payment is already pending verification` });
      }
    }

    // All receipt screenshots route through Cloudinary when configured
    let cloudinaryResult = null;
    if (isCloudinaryConfigured()) {
      try {
        cloudinaryResult = await uploadToCloudinary(req.file.path, 'shubh-sanjog/receipts');
      } catch (e) {
        console.warn('cloudinary receipt upload failed, using local:', e.message);
      }
    }

    // amount must match the contract price from the plans table
    const payment = {
      id: uuidv4(),
      userId,
      plan: plan.tier,
      amount: Number(plan.price),
      upiId: UPI_CONFIG.upiId,
      utr,
      receiptPath: cloudinaryResult?.secure_url || req.file.path,
      cloudinaryUrl: cloudinaryResult?.secure_url || null,
      cloudinaryPublicId: cloudinaryResult?.public_id || null,
      receiptName: req.file.originalname,
      receiptMimetype: req.file.mimetype,
      receiptSize: req.file.size,
      gateway: 'manual_upi',
      status: 'Pending Verification',
      createdAt: Date.now(),
    };
    store.payments.set(payment.id, payment);

    try {
      await db.savePayment(db._db, payment);
      await notifyUser(userId, 'payment_submitted', { paymentId: payment.id, plan: plan.tier, amount: plan.price });
    } catch (e) {
      console.warn('db save payment failed', e);
    }

    try {
      await writeAuditLog({
        actorId: userId,
        action: 'UPDATE_STATUS',
        targetUserId: userId,
        ip: req.ip || '',
        detail: `Manual UPI payment submitted for ${plan.tier} ₹${plan.price} (UTR ${utr}); awaiting admin verification.`,
      });
    } catch (e) { /* audit is best-effort */ }

    return res.status(201).json({ ok: true, payment: publicPaymentView(payment) });
  } catch (err) {
    console.error('submitPayment', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

async function listMyPayments(req, res) {
  try {
    let rows = [];
    try { rows = await db.listPayments(db._db); } catch (e) { rows = Array.from(store.payments.values()); }
    const mine = rows
      .filter((p) => p.userId === req.user.id)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map(publicPaymentView);
    return res.json({ ok: true, payments: mine });
  } catch (err) {
    console.error('listMyPayments', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = { createMulterForUser, getPlans, submitPayment, listMyPayments };
