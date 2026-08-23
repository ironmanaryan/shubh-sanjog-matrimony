const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { store, getPlan, activateMembership, UPI_CONFIG } = require('../data/store');
const db = require('../db');

// UPI gateway is a manual-verification placeholder: the customer pays via any UPI
// app (QR / UPI ID), submits the UTR + receipt screenshot, and an admin approves.
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
    status: payment.status || 'Pending Verification',
    rejectionReason: payment.rejectionReason || null,
    receiptName: payment.receiptName || null,
    createdAt: payment.createdAt,
    reviewedAt: payment.reviewedAt,
  };
}

async function getPlans(req, res) {
  try {
    // Single source of truth: the membership_plans table in SQLite
    let plans = null;
    if (db._db) {
      try { plans = await db.listMembershipPlansDb(db._db); } catch (e) { console.warn('listMembershipPlansDb failed', e); }
    }
    if (!plans || !plans.length) plans = Object.values(MEMBERSHIP_PACKAGES); // seed catalog fallback
    return res.json({ ok: true, upiId: UPI_CONFIG.upiId, payeeName: UPI_CONFIG.payeeName, plans });
  } catch (err) {
    console.error('getPlans', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// POST /api/payments — multipart: plan, utr, file (receipt)
async function submitPayment(req, res) {
  try {
    const userId = req.user.id;

    // Plan must come from the membership_plans table (fallback: seed catalog)
    let plan = null;
    if (db._db) {
      try { plan = await db.getPlanDb(db._db, req.body?.plan); } catch (e) { console.warn('getPlanDb failed', e); }
    }
    if (!plan) plan = getPlan(req.body?.plan);
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

    // amount must match the contract price from the plans table
    const payment = {
      id: uuidv4(),
      userId,
      plan: plan.tier,
      amount: Number(plan.price),
      upiId: UPI_CONFIG.upiId,
      utr,
      receiptPath: req.file.path,
      receiptName: req.file.originalname,
      receiptMimetype: req.file.mimetype,
      receiptSize: req.file.size,
      status: 'Pending Verification',
      createdAt: Date.now(),
    };
    store.payments.set(payment.id, payment);

    try {
      if (db._db) {
        await db.savePayment(db._db, payment);
        await db._db.run(
          `INSERT INTO notifications (id, toUserId, fromUserId, type, payload, at) VALUES (?, ?, ?, ?, ?, ?);`,
          [uuidv4(), userId, userId, 'payment_submitted', JSON.stringify({ paymentId: payment.id, plan: plan.tier, amount: plan.price }), Date.now()]
        );
      }
    } catch (e) {
      console.warn('db save payment failed', e);
    }

    return res.status(201).json({ ok: true, payment: publicPaymentView(payment) });
  } catch (err) {
    console.error('submitPayment', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

async function listMyPayments(req, res) {
  try {
    // DB is the source of truth for pending approval tracking
    if (db._db) {
      const rows = await db._db.all(`SELECT * FROM payments WHERE userId = ? ORDER BY createdAt DESC`, [req.user.id]);
      return res.json({ ok: true, payments: rows.map(publicPaymentView) });
    }
    const mine = Array.from(store.payments.values())
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
