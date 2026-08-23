const express = require('express');
const router = express.Router();
const fs = require('fs');
const { verifyTokenMiddleware } = require('../middleware/auth');
const { ROLES, ASSIGNABLE_ROLES, STAFF_ROLES, permissionsFor, requireStaffRole, requirePermission } = require('../middleware/rbac');
const { listNotes, addNote } = require('../controllers/internalNotesController');
const { listInquiries, updateInquiryStatus } = require('../controllers/inquiriesController');
const { store, activateMembership, getPlan } = require('../data/store');
const db = require('../db');

function toCandidateSummary(profile, userId, identifier) {
  return {
    id: userId,
    name: profile?.personal?.firstName ? `${profile.personal.firstName} ${profile.personal.lastName || ''}`.trim() : identifier || userId,
    age: profile?.personal?.dob ? Math.max(18, new Date().getFullYear() - new Date(profile.personal.dob).getFullYear()) : 28,
    city: profile?.personal?.city || 'Unknown',
    religion: profile?.personal?.religion || 'Any',
    gender: profile?.personal?.gender || 'Any',
    profession: profile?.education?.profession || 'Professional',
    matchScore: 88 + Math.floor(Math.random() * 10),
    identifier,
    // §30/§31: completion score + verified badge surfaced everywhere profiles are shown
    profileCompletion: profile?.profileCompletion || 0,
    profileStatus: profile?.status || 'Draft',
    verifiedBadge: (profile?.status || 'Draft') === 'Approved',
    highestQualification: profile?.education?.highestQualification || '',
    caste: profile?.personal?.caste || '',
    state: profile?.personal?.state || '',
  };
}

// Interest status between two users derived from real interest_requests data
// (scope PDF §27 "track match interest status"). Hydrated store mirrors SQLite.
function interestStatusBetweenUsers(userA, userB) {
  const request = store.interestRequests.find(
    (r) => (r.fromUserId === userA && r.toProfileId === userB) || (r.fromUserId === userB && r.toProfileId === userA)
  );
  return request ? request.status : null;
}

function displayNameOf(userId) {
  const user = store.users.get(userId);
  const profile = store.profiles.get(userId);
  const personal = profile?.personal || {};
  return personal.firstName ? `${personal.firstName} ${personal.lastName || ''}`.trim() : user?.identifier || userId;
}

// GET /api/admin/customers — customers with their saved partner-preference
// summary so the Matching workspace can filter candidates per customer (§27).
router.get('/customers', verifyTokenMiddleware, requireStaffRole, async (req, res) => {
  try {
    const users = Array.from(store.users.values()).filter((user) => user.role === 'customer');
    const customers = users.map((user) => {
      const profile = store.profiles.get(user.id);
      const p = profile?.preferences || {};
      return {
        id: user.id,
        identifier: user.identifier,
        role: user.role || 'customer',
        profileStatus: profile?.status || 'Draft',
        profileCompletion: profile?.profileCompletion || 0,
        preferences: {
          preferredGender: p.preferredGender || '',
          minAge: p.minAge || '',
          maxAge: p.maxAge || '',
          religion: p.religion || '',
          caste: p.caste || '',
          motherTongue: p.motherTongue || '',
          location: p.location || '',
          education: p.education || '',
          profession: p.profession || '',
        },
      };
    });
    return res.json({ ok: true, customers });
  } catch (error) {
    console.error('get customers error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// GET /api/admin/customers/:id — full customer detail (personal, education,
// family structure, preferences) for the admin customer workspace page
// /admin/customers/[id]. Contact details stay staff-visible only.
router.get('/customers/:id', verifyTokenMiddleware, requireStaffRole, async (req, res) => {
  try {
    const userId = String(req.params.id || '');
    const user = store.users.get(userId);
    let profile = store.profiles.get(userId) || null;
    try {
      if (db._db) {
        const persisted = await db.getProfile(db._db, userId);
        if (persisted) profile = persisted;
      }
    } catch (e) { console.warn('customer detail db lookup failed', e); }

    if (!user && !profile) return res.status(404).json({ ok: false, error: 'Customer not found' });

    let completion = Number(profile?.profileCompletion) || 0;
    try {
      const { calculateProfileCompletion } = require('../controllers/dashboardController');
      completion = calculateProfileCompletion(profile || {});
    } catch (e) { /* keep stored value */ }

    let assignments = [];
    try {
      if (db._db) assignments = await db.listMatchAssignmentsDb(db._db, userId);
    } catch (e) { console.warn('list assignments for customer failed', e); }

    return res.json({
      ok: true,
      customer: {
        id: userId,
        identifier: user?.identifier || '',
        role: user?.role || 'customer',
        createdAt: user?.createdAt || null,
      },
      profile: profile ? {
        personal: profile.personal || {},
        education: profile.education || {},
        family: profile.family || {},
        preferences: profile.preferences || {},
        status: profile.status || 'Draft',
        reviewNote: profile.reviewNote || null,
        submittedAt: profile.submittedAt || null,
        reviewedAt: profile.reviewedAt || null,
        updatedAt: profile.updatedAt || null,
        profileCompletion: completion,
      } : null,
      assignments,
    });
  } catch (error) {
    console.error('get customer detail error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

router.get('/candidates', verifyTokenMiddleware, requireStaffRole, async (req, res) => {
  try {
    const candidates = [];
    for (const [userId, user] of store.users.entries()) {
      if (user.role !== 'customer') continue;
      const profile = store.profiles.get(userId);
      if (!profile) continue; // only real biodata profiles are matchable
      candidates.push(toCandidateSummary(profile, userId, user.identifier));
    }
    return res.json({ ok: true, candidates });
  } catch (error) {
    console.error('get candidates error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// GET /api/admin/matching/candidates — filter profiles by partner preferences
// (scope PDF §27). Admin/Staff/RM can all filter (read); assigning a match
// requires the `manageMatches` permission on the POST endpoint below.
router.get('/matching/candidates', verifyTokenMiddleware, requireStaffRole, async (req, res) => {
  try {
    const q = req.query || {};
    const minAge = Number(q.minAge) > 0 ? Number(q.minAge) : null;
    const maxAge = Number(q.maxAge) > 0 ? Number(q.maxAge) : null;
    const gender = String(q.gender || '').trim().toLowerCase();
    const religion = String(q.religion || '').trim().toLowerCase();
    const caste = String(q.caste || '').trim().toLowerCase();
    const education = String(q.education || '').trim().toLowerCase();
    const location = String(q.location || '').trim().toLowerCase();
    const profileStatus = String(q.profileStatus || '').trim();
    const minCompletion = Number(q.minCompletion) > 0 ? Number(q.minCompletion) : null;

    const results = [];
    for (const [userId, user] of store.users.entries()) {
      if (user.role !== 'customer') continue;
      const profile = store.profiles.get(userId);
      if (!profile) continue;

      // §30 data isolation is admin-side by design here: staff roles may view,
      // but contact details are never included in these summaries.
      const summary = toCandidateSummary(profile, userId, user.identifier);

      if (profileStatus && summary.profileStatus !== profileStatus) continue;
      if (gender && !summary.gender.toLowerCase().startsWith(gender)) continue;
      if (minAge && !(summary.age >= minAge)) continue;
      if (maxAge && !(summary.age <= maxAge)) continue;
      if (religion && !String(summary.religion).toLowerCase().includes(religion)) continue;
      if (caste && !String(summary.caste).toLowerCase().includes(caste)) continue;
      if (education && !`${summary.highestQualification} ${summary.profession}`.toLowerCase().includes(education)) continue;
      if (location && !`${summary.city} ${summary.state}`.toLowerCase().includes(location)) continue;
      if (minCompletion && !(summary.profileCompletion >= minCompletion)) continue;

      results.push({ ...summary, interestStatusFromCaller: req.query.customerId ? interestStatusBetweenUsers(String(req.query.customerId), userId) : null });
    }

    return res.json({ ok: true, count: results.length, candidates: results });
  } catch (error) {
    console.error('matching candidates error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /api/admin/match-assignment — assign/recommend a match to a customer.
// RBAC §29: admin + relationship_manager only (`manageMatches`).
router.post('/match-assignment', verifyTokenMiddleware, requirePermission('manageMatches'), async (req, res) => {
  try {
    const { customerId, candidateId, note = '' } = req.body || {};
    if (!customerId || !candidateId) return res.status(400).json({ ok: false, error: 'customerId and candidateId required' });

    const assignment = { id: require('uuid').v4(), customerId, candidateId, note, assignedBy: req.user.id, assignedAt: Date.now() };
    const assignments = store.matchAssignments.get(customerId) || [];
    assignments.push(assignment);
    store.matchAssignments.set(customerId, assignments);

    // persist + notify the customer (scope PDF §17 "New Match Assigned")
    try {
      if (db._db) {
        await db.saveMatchAssignmentDb(db._db, assignment);
        await db._db.run(
          `INSERT INTO notifications (id, toUserId, fromUserId, type, payload, at) VALUES (?, ?, ?, ?, ?, ?);`,
          [require('uuid').v4(), customerId, req.user.id, 'new_match_assigned', JSON.stringify({ assignmentId: assignment.id, candidateId }), Date.now()]
        );
      }
    } catch (e) {
      console.warn('db save match assignment failed', e);
    }

    return res.json({ ok: true, assignment, assignments });
  } catch (error) {
    console.error('assign candidate error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// GET /api/admin/match-assignments — full assignment log with customer/candidate
// display names and the live interest status between each pair (§27 tracking).
router.get('/match-assignments', verifyTokenMiddleware, requireStaffRole, async (req, res) => {
  try {
    let rows = [];
    if (db._db) rows = await db.listMatchAssignmentsDb(db._db, req.query.customerId || null);
    else rows = Array.from(store.matchAssignments.values()).flat();
    const assignments = rows.map((row) => ({
      ...row,
      customerName: displayNameOf(row.customerId),
      candidateName: displayNameOf(row.candidateId),
      interestStatus: interestStatusBetweenUsers(row.customerId, row.candidateId) || 'None',
    }));
    return res.json({ ok: true, assignments });
  } catch (error) {
    console.error('list match assignments error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// --- Profile Review workflow (scope PDF §22) --------------------------------

function toProfileReviewView(row) {
  const personal = row.personal || {};
  const education = row.education || {};
  return {
    userId: row.userId,
    customerId: row.userId,
    name: personal.firstName ? `${personal.firstName} ${personal.lastName || ''}`.trim() : row.customerIdentifier || row.userId,
    identifier: row.customerIdentifier || '',
    gender: personal.gender || '',
    age: row.personal?.dob ? Math.max(18, new Date().getFullYear() - new Date(row.personal.dob).getFullYear()) : null,
    city: personal.city || '',
    religion: personal.religion || '',
    profession: education.profession || '',
    status: row.status || 'Draft',
    profileCompletion: row.profileCompletion || 0,
    reviewNote: row.reviewNote || null,
    submittedAt: row.submittedAt || null,
    reviewedAt: row.reviewedAt || null,
    updatedAt: row.updatedAt || null,
    profile: { personal: row.personal || {}, education: row.education || {}, family: row.family || {}, preferences: row.preferences || {} },
  };
}

// GET /api/admin/profiles?status=Submitted|Under Review|Approved|Rejected|Draft
router.get('/profiles', verifyTokenMiddleware, requirePermission('viewQueues'), async (req, res) => {
  try {
    if (!db._db) return res.status(503).json({ ok: false, error: 'Database unavailable' });
    const statusParam = String(req.query.status || '').trim();
    const statuses = statusParam ? [statusParam] : ['Submitted', 'Under Review'];
    const rows = await db.listProfilesByStatusDb(db._db, statuses);
    return res.json({ ok: true, profiles: rows.map(toProfileReviewView) });
  } catch (error) {
    console.error('admin list profiles error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

async function reviewProfile(req, res, nextStatus, fallbackNote) {
  try {
    const { userId, note } = req.body || {};
    if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
    if (!db._db) return res.status(503).json({ ok: false, error: 'Database unavailable' });

    const finalNote = note || fallbackNote;
    await db.setProfileReview(db._db, userId, { status: nextStatus, reviewNote: finalNote });

    // keep the hydrated store in sync
    const cached = store.profiles.get(userId);
    if (cached) {
      cached.status = nextStatus;
      cached.reviewNote = finalNote;
      cached.reviewedAt = Date.now();
      store.profiles.set(userId, cached);
    }

    const type = nextStatus === 'Approved' ? 'profile_approved' : 'profile_rejected';
    await db._db.run(
      `INSERT INTO notifications (id, toUserId, fromUserId, type, payload, at) VALUES (?, ?, ?, ?, ?, ?);`,
      [require('uuid').v4(), userId, req.user.id, type, JSON.stringify({ status: nextStatus, note: finalNote }), Date.now()]
    );

    return res.json({ ok: true, userId, status: nextStatus, reviewNote: finalNote });
  } catch (error) {
    console.error(`reviewProfile ${nextStatus} error`, error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// POST /api/admin/profiles/approve { userId, note? } — approval unmasks photo/contact per privacy rules
// RBAC §29: admin + relationship_manager (`reviewProfiles`); staff is read-only.
router.post('/profiles/approve', verifyTokenMiddleware, requirePermission('reviewProfiles'), (req, res) => reviewProfile(req, res, 'Approved', null));
// POST /api/admin/profiles/reject { userId, reason }
router.post('/profiles/reject', verifyTokenMiddleware, requirePermission('reviewProfiles'), (req, res) => reviewProfile(req, res, 'Rejected', 'No reason provided'));
// POST /api/admin/profiles/request-changes { userId, note } — back to Under Review with change request
router.post('/profiles/request-changes', verifyTokenMiddleware, requirePermission('reviewProfiles'), (req, res) => reviewProfile(req, res, 'Under Review', 'Changes requested'));

// GET /api/admin/documents
router.get('/documents', verifyTokenMiddleware, requirePermission('viewQueues'), async (req, res) => {
  try {
    if (db._db) {
      const rows = await db._db.all(`SELECT d.*, u.identifier AS customerIdentifier FROM documents d LEFT JOIN users u ON u.id = d.userId ORDER BY d.uploadedAt DESC`);
      return res.json({ ok: true, documents: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        customerId: row.userId,
        customerName: row.customerIdentifier || row.userId,
        documentType: row.documentType || (row.originalName?.includes('kundli') ? 'kundli' : 'identity'),
        status: row.status || 'Pending',
        rejectionReason: row.rejectionReason || null,
        originalName: row.originalName,
        uploadedAt: row.uploadedAt,
        mimetype: row.mimetype,
        size: row.size,
      })) });
    }

    const documents = [];
    for (const [id, meta] of store.documents.entries()) {
      documents.push({
        id,
        userId: meta.userId,
        customerId: meta.userId,
        customerName: meta.userId,
        documentType: meta.documentType || (meta.originalName?.includes('kundli') ? 'kundli' : 'identity'),
        status: meta.status || 'Pending',
        rejectionReason: meta.rejectionReason || null,
        originalName: meta.originalName,
        uploadedAt: meta.uploadedAt,
        mimetype: meta.mimetype,
        size: meta.size,
      });
    }
    return res.json({ ok: true, documents });
  } catch (error) {
    console.error('list admin documents error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /api/admin/documents/approve
router.post('/documents/approve', verifyTokenMiddleware, requirePermission('reviewProfiles'), async (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'id required' });
  const meta = store.documents.get(id);
  if (meta) meta.status = 'Approved';
  try {
    if (db._db) await db.setDocumentStatus(db._db, id, 'Approved', null);
  } catch (e) { console.warn('db set status failed', e); }
  return res.json({ ok: true, id, status: 'Approved' });
});

// POST /api/admin/documents/reject
router.post('/documents/reject', verifyTokenMiddleware, requirePermission('reviewProfiles'), async (req, res) => {
  const { id, reason } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'id required' });
  const meta = store.documents.get(id);
  if (meta) meta.status = 'Rejected';
  if (meta) meta.rejectionReason = reason || 'No reason provided';
  try {
    if (db._db) await db.setDocumentStatus(db._db, id, 'Rejected', reason || 'No reason provided');
  } catch (e) { console.warn('db set status failed', e); }
  return res.json({ ok: true, id, status: 'Rejected', reason: reason || 'No reason provided' });
});

// --- Payment Approvals (UPI verification queue) -----------------------------

function paymentWithCustomer(payment) {
  const user = store.users.get(payment.userId);
  const profile = store.profiles.get(payment.userId);
  const personal = profile?.personal || {};
  return {
    id: payment.id,
    userId: payment.userId,
    customerName: personal.firstName ? `${personal.firstName} ${personal.lastName || ''}`.trim() : user?.identifier || payment.userId,
    customerIdentifier: user?.identifier || '',
    plan: payment.plan,
    amount: payment.amount,
    upiId: payment.upiId,
    utr: payment.utr,
    status: payment.status || 'Pending Verification',
    rejectionReason: payment.rejectionReason || null,
    receiptName: payment.receiptName || null,
    hasReceipt: Boolean(payment.receiptPath),
    createdAt: payment.createdAt,
    reviewedAt: payment.reviewedAt,
  };
}

// GET /api/admin/payments — every submitted UPI payment
router.get('/payments', verifyTokenMiddleware, requirePermission('viewQueues'), async (req, res) => {
  try {
    let payments = [];
    if (db._db && db._db.all) {
      const rows = await db.listPayments(db._db);
      payments = rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        plan: row.plan,
        amount: row.amount,
        upiId: row.upiId,
        utr: row.utr,
        status: row.status || 'Pending Verification',
        rejectionReason: row.rejectionReason || null,
        receiptPath: row.receiptPath,
        receiptName: row.receiptName,
        createdAt: row.createdAt,
        reviewedAt: row.reviewedAt,
      }));
    } else {
      payments = Array.from(store.payments.values());
    }
    const sorted = payments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return res.json({ ok: true, payments: sorted.map(paymentWithCustomer) });
  } catch (error) {
    console.error('list admin payments error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /api/admin/payments/approve { id } — verify the UTR and activate the purchased membership
// RBAC §29: admin only (`verifyPayments`) — staff/RM cannot touch money flows.
router.post('/payments/approve', verifyTokenMiddleware, requirePermission('verifyPayments'), async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });

    const payment = store.payments.get(id);
    if (!payment) return res.status(404).json({ ok: false, error: 'Payment not found' });
    if (payment.status !== 'Pending Verification') {
      return res.status(409).json({ ok: false, error: `Payment already ${payment.status.toLowerCase()}` });
    }

    // activate the membership for the purchased tier (plan resolved from the plans table)
    const startedAt = Date.now();
    let plan = null;
    if (db._db) {
      try { plan = await db.getPlanDb(db._db, payment.plan); } catch (e) { console.warn('getPlanDb failed', e); }
    }
    if (!plan) plan = getPlan(payment.plan);
    const membership = activateMembership(payment.userId, plan, { startedAt });

    payment.status = 'Approved';
    payment.reviewedAt = Date.now();
    try {
      if (db._db) {
        await db.setPaymentStatus(db._db, id, 'Approved', null);
        await db.saveMembershipDb(db._db, payment.userId, membership, id);
        const type = payment.plan === 'Consultation' ? 'payment_approved' : 'membership_activated';
        await db._db.run(
          `INSERT INTO notifications (id, toUserId, fromUserId, type, payload, at) VALUES (?, ?, ?, ?, ?, ?);`,
          [require('uuid').v4(), payment.userId, req.user.id, type, JSON.stringify({ paymentId: id, plan: payment.plan }), Date.now()]
        );
      }
    } catch (e) {
      console.warn('db approve payment failed', e);
    }

    return res.json({ ok: true, id, status: 'Approved', membership });
  } catch (error) {
    console.error('approve payment error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /api/admin/payments/reject { id, reason }
router.post('/payments/reject', verifyTokenMiddleware, requirePermission('verifyPayments'), async (req, res) => {
  try {
    const { id, reason } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });

    const payment = store.payments.get(id);
    if (!payment) return res.status(404).json({ ok: false, error: 'Payment not found' });
    if (payment.status !== 'Pending Verification') {
      return res.status(409).json({ ok: false, error: `Payment already ${payment.status.toLowerCase()}` });
    }

    const finalReason = reason || 'UTR could not be verified';
    payment.status = 'Rejected';
    payment.rejectionReason = finalReason;
    payment.reviewedAt = Date.now();
    try {
      if (db._db) {
        await db.setPaymentStatus(db._db, id, 'Rejected', finalReason);
        await db._db.run(
          `INSERT INTO notifications (id, toUserId, fromUserId, type, payload, at) VALUES (?, ?, ?, ?, ?, ?);`,
          [require('uuid').v4(), payment.userId, req.user.id, 'payment_rejected', JSON.stringify({ paymentId: id, reason: finalReason }), Date.now()]
        );
      }
    } catch (e) {
      console.warn('db reject payment failed', e);
    }

    return res.json({ ok: true, id, status: 'Rejected', reason: finalReason });
  } catch (error) {
    console.error('reject payment error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// GET /api/admin/payments/:id/receipt — stream the uploaded receipt to staff
router.get('/payments/:id/receipt', verifyTokenMiddleware, requireStaffRole, async (req, res) => {
  try {
    const payment = store.payments.get(req.params.id);
    if (!payment) return res.status(404).json({ ok: false, error: 'Payment not found' });
    if (!payment.receiptPath || !fs.existsSync(payment.receiptPath)) {
      return res.status(404).json({ ok: false, error: 'Receipt file not found' });
    }

    res.setHeader('Content-Type', payment.receiptMimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${payment.receiptName || 'receipt'}"`);
    const stream = fs.createReadStream(payment.receiptPath);
    stream.on('error', () => res.status(500).end());
    stream.pipe(res);
  } catch (error) {
    console.error('receipt download error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// GET /api/admin/stats - overview metrics + attention-required items for the admin dashboard
router.get('/stats', verifyTokenMiddleware, requirePermission('viewQueues'), async (req, res) => {
  try {
    const database = db._db;
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    let stats = {
      totalCustomers: 0,
      newCustomers: 0,
      activeMembers: 0,
      pendingDocuments: 0,
      approvedDocuments: 0,
      rejectedDocuments: 0,
      pendingProfiles: 0,
      approvedProfiles: 0,
      rejectedProfiles: 0,
      profilesCreated: 0,
      avgProfileCompletion: 0,
      upcomingAppointments: 0,
      completedAppointments: 0,
      totalAppointments: 0,
      pendingPayments: 0,
      approvedPayments: 0,
      rejectedPayments: 0,
      activeGoldMemberships: 0,
      activePremiumMemberships: 0,
      expiringMemberships: 0,
      revenueApproved: 0,
    };
    let attention = { pendingDocuments: [], upcomingAppointments: [], recentCustomers: [], pendingPayments: [], pendingProfiles: [] };

    if (database) {
      const count = async (sql, params = []) => {
        const row = await database.get(`SELECT COUNT(*) AS n FROM (${sql})`, params);
        return row ? Number(row.n) : 0;
      };

      stats.totalCustomers = await count(`SELECT 1 FROM users WHERE role != 'admin'`);
      stats.newCustomers = await count(`SELECT 1 FROM users WHERE role != 'admin' AND createdAt >= ?`, [weekAgo]);
      stats.pendingDocuments = await count(`SELECT 1 FROM documents WHERE status IN ('Pending', 'Pending Review')`);
      stats.approvedDocuments = await count(`SELECT 1 FROM documents WHERE status = 'Approved'`);
      stats.rejectedDocuments = await count(`SELECT 1 FROM documents WHERE status = 'Rejected'`);
      stats.pendingProfiles = await count(`SELECT 1 FROM profiles WHERE status = 'Submitted'`);
      stats.approvedProfiles = await count(`SELECT 1 FROM profiles WHERE status = 'Approved'`);
      stats.rejectedProfiles = await count(`SELECT 1 FROM profiles WHERE status = 'Rejected'`);
      stats.profilesCreated = await count(`SELECT 1 FROM profiles`);
      stats.upcomingAppointments = await count(`SELECT 1 FROM appointments WHERE status = 'Booked' AND date >= ?`, [today]);
      stats.completedAppointments = await count(`SELECT 1 FROM appointments WHERE status = 'Completed'`);
      stats.totalAppointments = await count(`SELECT 1 FROM appointments`);
      stats.pendingPayments = await count(`SELECT 1 FROM payments WHERE status = 'Pending Verification'`);
      stats.approvedPayments = await count(`SELECT 1 FROM payments WHERE status = 'Approved'`);
      stats.rejectedPayments = await count(`SELECT 1 FROM payments WHERE status = 'Rejected'`);

      const completionRow = await database.get(`SELECT AVG(profileCompletion) AS avg FROM profiles`);
      stats.avgProfileCompletion = Math.round(Number(completionRow?.avg) || 0);

      // membership + revenue metrics from persisted rows
      const now = Date.now();
      const memberRows = await database.all(`SELECT tier, active, expiresAt FROM memberships`);
      for (const m of memberRows) {
        if (!m.active) continue;
        if (m.expiresAt && Number(m.expiresAt) < now) continue;
        stats.activeMembers += 1;
        if (m.tier === 'Gold') stats.activeGoldMemberships += 1;
        if (m.tier === 'Premium') stats.activePremiumMemberships += 1;
        if (m.expiresAt && Number(m.expiresAt) < now + 7 * 24 * 60 * 60 * 1000) stats.expiringMemberships += 1;
      }
      const revenueRow = await database.get(`SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'Approved'`);
      stats.revenueApproved = Number(revenueRow?.total) || 0;

      attention.pendingDocuments = await database.all(
        `SELECT d.id, d.originalName, d.uploadedAt, u.identifier AS customerName
         FROM documents d LEFT JOIN users u ON u.id = d.userId
         WHERE d.status IN ('Pending', 'Pending Review') ORDER BY d.uploadedAt DESC LIMIT 5`
      );
      attention.pendingProfiles = await database.all(
        `SELECT p.userId AS id, p.submittedAt, p.profileCompletion, u.identifier AS customerName
         FROM profiles p LEFT JOIN users u ON u.id = p.userId
         WHERE p.status = 'Submitted' ORDER BY p.submittedAt DESC LIMIT 5`
      );
      attention.upcomingAppointments = await database.all(
        `SELECT a.id, a.date, a.time, a.type, u.identifier AS customerName
         FROM appointments a LEFT JOIN users u ON u.id = a.userId
         WHERE a.status = 'Booked' AND a.date >= ? ORDER BY a.date ASC LIMIT 5`,
        [today]
      );
      attention.recentCustomers = await database.all(
        `SELECT id, identifier, createdAt FROM users WHERE role != 'admin' ORDER BY createdAt DESC LIMIT 5`
      );
      attention.pendingPayments = await database.all(
        `SELECT p.id, p.plan, p.amount, p.createdAt, u.identifier AS customerName
         FROM payments p LEFT JOIN users u ON u.id = p.userId
         WHERE p.status = 'Pending Verification' ORDER BY p.createdAt DESC LIMIT 5`
      );
    } else {
      for (const user of store.users.values()) {
        if (user.role !== 'admin') {
          stats.totalCustomers += 1;
          if ((user.createdAt || 0) >= weekAgo) stats.newCustomers += 1;
        }
      }
      for (const doc of store.documents.values()) {
        if (doc.status === 'Pending') stats.pendingDocuments += 1;
        else if (doc.status === 'Approved') stats.approvedDocuments += 1;
        else if (doc.status === 'Rejected') stats.rejectedDocuments += 1;
      }
      for (const payment of store.payments.values()) {
        if (payment.status === 'Pending Verification') stats.pendingPayments += 1;
        else if (payment.status === 'Approved') stats.approvedPayments += 1;
        else if (payment.status === 'Rejected') stats.rejectedPayments += 1;
      }
      stats.profilesCreated = store.profiles.size;
      for (const appointment of store.appointments.values()) {
        stats.totalAppointments += 1;
        if (appointment.status === 'Completed') stats.completedAppointments += 1;
        else if (appointment.status !== 'Cancelled' && String(appointment.date) >= today) stats.upcomingAppointments += 1;
      }
      stats.activeMembers = Array.from(store.memberships.values()).filter((m) => m && m.active).length;

      attention.pendingDocuments = Array.from(store.documents.values())
        .filter((d) => d.status === 'Pending')
        .slice(0, 5)
        .map((d) => ({ id: d.id, originalName: d.originalName, uploadedAt: d.uploadedAt, customerName: d.userId }));
      attention.upcomingAppointments = Array.from(store.appointments.values())
        .filter((a) => a.status !== 'Cancelled' && String(a.date) >= today)
        .slice(0, 5)
        .map((a) => ({ id: a.id, date: a.date, time: a.time, type: a.type, customerName: a.userId }));
      attention.recentCustomers = Array.from(store.users.values())
        .filter((u) => u.role !== 'admin')
        .slice(0, 5)
        .map((u) => ({ id: u.id, identifier: u.identifier, createdAt: u.createdAt }));
      attention.pendingPayments = Array.from(store.payments.values())
        .filter((p) => p.status === 'Pending Verification')
        .slice(0, 5)
        .map((p) => ({ id: p.id, plan: p.plan, amount: p.amount, createdAt: p.createdAt, customerName: (store.users.get(p.userId) || {}).identifier || p.userId }));
    }

    return res.json({ ok: true, stats, attention });
  } catch (error) {
    console.error('get admin stats error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// --- RBAC session info (scope PDF §29) --------------------------------------

// GET /api/admin/me — role + effective permissions for the signed-in staff user.
// The frontend uses this to hide/disable restricted tabs and actions.
router.get('/me', verifyTokenMiddleware, requireStaffRole, (req, res) => {
  return res.json({
    ok: true,
    me: {
      id: req.user.id,
      identifier: req.user.identifier,
      role: req.user.role,
      permissions: permissionsFor(req.user.role),
    },
  });
});

// --- Team & role management (RBAC §29, admin only) ---------------------------

// GET /api/admin/team — all users with their roles
router.get('/team', verifyTokenMiddleware, requirePermission('manageTeam'), async (req, res) => {
  try {
    const team = Array.from(store.users.values()).map((u) => ({
      id: u.id,
      identifier: u.identifier,
      role: u.role || 'customer',
      createdAt: u.createdAt,
    }));
    return res.json({ ok: true, team, assignableRoles: ASSIGNABLE_ROLES });
  } catch (error) {
    console.error('list team error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /api/admin/team/role { userId, role } — change a user's role
router.post('/team/role', verifyTokenMiddleware, requirePermission('manageTeam'), async (req, res) => {
  try {
    const { userId, role } = req.body || {};
    if (!userId || !ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ ok: false, error: `userId and a valid role (${ASSIGNABLE_ROLES.join(', ')}) required` });
    }
    if (userId === req.user.id) {
      return res.status(400).json({ ok: false, error: 'You cannot change your own role' });
    }

    let updated = null;
    try {
      if (db._db) {
        await db._db.run(`UPDATE users SET role = ? WHERE id = ?`, [role, userId]);
        updated = await db.getUserById(db._db, userId);
      }
    } catch (e) {
      console.warn('db update role failed', e);
    }

    // keep the hydrated store in sync
    const cached = store.users.get(userId);
    if (cached) {
      cached.role = role;
      store.users.set(userId, cached);
    }

    return res.json({ ok: true, userId, role, user: updated ? { id: updated.id, identifier: updated.identifier, role: updated.role } : { id: userId, role } });
  } catch (error) {
    console.error('update team role error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// --- Reports & Analytics (scope PDF §28) -------------------------------------

// GET /api/admin/analytics — revenue split (Consultation vs Memberships),
// active plan counts, appointment stats. RBAC §29: admin + staff only.
router.get('/analytics', verifyTokenMiddleware, requirePermission('viewAnalytics'), async (req, res) => {
  try {
    const database = db._db;
    const analytics = {
      revenue: { consultation: 0, memberships: 0, gold: 0, premium: 0, total: 0, approvedPaymentsCount: 0 },
      activePlans: { consultation: 0, gold: 0, premium: 0, total: 0 },
      appointments: { total: 0, booked: 0, completed: 0, cancelled: 0, upcoming: 0 },
      paymentsByStatus: { approved: 0, pending: 0, rejected: 0 },
      customers: { total: 0 },
    };

    const isMembershipPlanTier = (tier) => tier === 'Gold' || tier === 'Premium';

    if (database) {
      const now = Date.now();
      const today = new Date().toISOString().slice(0, 10);

      // Revenue: Consultation sessions are paid one-offs; Gold/Premium are the
      // membership tiers (scope PDF §9 pricing).
      const revenueRows = await database.all(`SELECT plan, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'Approved' GROUP BY plan`);
      for (const row of revenueRows) {
        const count = Number(row.n) || 0;
        const total = Number(row.total) || 0;
        analytics.revenue.approvedPaymentsCount += count;
        analytics.revenue.total += total;
        if (isMembershipPlanTier(row.plan)) {
          analytics.revenue.memberships += total;
          if (row.plan === 'Gold') analytics.revenue.gold += total;
          if (row.plan === 'Premium') analytics.revenue.premium += total;
        } else {
          analytics.revenue.consultation += total;
        }
      }

      const statusRows = await database.all(`SELECT status, COUNT(*) AS n FROM payments GROUP BY status`);
      for (const row of statusRows) {
        const key = String(row.status || '').toLowerCase().includes('approved') ? 'approved'
          : String(row.status || '').toLowerCase().includes('reject') ? 'rejected' : 'pending';
        analytics.paymentsByStatus[key] += Number(row.n) || 0;
      }

      // Active plans from persisted memberships that haven't expired
      const memberRows = await database.all(`SELECT tier, active, expiresAt FROM memberships`);
      for (const m of memberRows) {
        if (!m.active) continue;
        if (m.expiresAt && Number(m.expiresAt) < now) continue;
        analytics.activePlans.total += 1;
        if (isMembershipPlanTier(m.tier)) analytics.activePlans[m.tier.toLowerCase()] += 1;
        else analytics.activePlans.consultation += 1;
      }

      const apptRows = await database.all(`SELECT status, date, COUNT(*) AS n FROM appointments GROUP BY status, date`);
      for (const row of apptRows) {
        const n = Number(row.n) || 0;
        analytics.appointments.total += n;
        const status = String(row.status || 'Booked');
        if (status === 'Completed') analytics.appointments.completed += n;
        else if (status === 'Cancelled') analytics.appointments.cancelled += n;
        else analytics.appointments.booked += n;
        if (status !== 'Cancelled' && status !== 'Completed' && String(row.date) >= today) analytics.appointments.upcoming += n;
      }

      const customerRow = await database.get(`SELECT COUNT(*) AS n FROM users WHERE role = 'customer'`);
      analytics.customers.total = Number(customerRow?.n) || 0;
    } else {
      // in-memory fallback
      for (const payment of store.payments.values()) {
        if (payment.status === 'Approved') {
          analytics.revenue.approvedPaymentsCount += 1;
          analytics.revenue.total += Number(payment.amount) || 0;
          if (isMembershipPlanTier(payment.plan)) analytics.revenue.memberships += Number(payment.amount) || 0;
          else analytics.revenue.consultation += Number(payment.amount) || 0;
        }
        const key = String(payment.status || '').toLowerCase().includes('approved') ? 'approved'
          : String(payment.status || '').toLowerCase().includes('reject') ? 'rejected' : 'pending';
        analytics.paymentsByStatus[key] += 1;
      }
      for (const membership of store.memberships.values()) {
        if (!membership || !membership.active) continue;
        analytics.activePlans.total += 1;
        if (isMembershipPlanTier(membership.tier)) analytics.activePlans[membership.tier.toLowerCase()] += 1;
        else analytics.activePlans.consultation += 1;
      }
      for (const a of store.appointments.values()) {
        analytics.appointments.total += 1;
        if (a.status === 'Completed') analytics.appointments.completed += 1;
        else if (a.status === 'Cancelled') analytics.appointments.cancelled += 1;
        else analytics.appointments.booked += 1;
      }
      analytics.customers.total = Array.from(store.users.values()).filter((u) => u.role === 'customer').length;
    }

    return res.json({ ok: true, analytics });
  } catch (error) {
    console.error('get admin analytics error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// CSV helpers — RFC4180-ish escaping for the export endpoint
function csvEscape(value) {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
}

// GET /api/admin/analytics/export — CSV Export button target (§28).
// One file with three labelled sections: Revenue ledger (payments),
// Active Plans snapshot, Appointments summary. Admin + staff only.
router.get('/analytics/export', verifyTokenMiddleware, requirePermission('exportAnalytics'), async (req, res) => {
  try {
    const database = db._db;
    const sections = [];

    sections.push(['# Shubh Sanjog Matrimony — Analytics Export']);
    sections.push([`# Generated ${new Date().toISOString()}`]);

    // Section 1: Revenue ledger (all payments with status)
    sections.push([]);
    sections.push(['# REVENUE LEDGER (PAYMENTS)']);
    sections.push(['Payment ID', 'Date', 'Customer', 'Plan', 'Category', 'Amount (INR)', 'Status']);
    const payments = database
      ? await database.all(`SELECT p.*, u.identifier AS customerIdentifier FROM payments p LEFT JOIN users u ON u.id = p.userId ORDER BY p.createdAt DESC`)
      : Array.from(store.payments.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map((p) => ({ ...p, customerIdentifier: (store.users.get(p.userId) || {}).identifier || p.userId }));
    let consultationTotal = 0;
    let membershipTotal = 0;
    for (const p of payments) {
      const category = p.plan === 'Gold' || p.plan === 'Premium' ? 'Membership' : 'Consultation';
      if (p.status === 'Approved') {
        if (category === 'Membership') membershipTotal += Number(p.amount) || 0;
        else consultationTotal += Number(p.amount) || 0;
      }
      sections.push([p.id, new Date(p.createdAt || 0).toISOString(), p.customerIdentifier || '', p.plan || '', category, Number(p.amount) || 0, p.status || 'Pending Verification']);
    }
    sections.push([], ['TOTAL APPROVED CONSULTATION', '', '', '', '', consultationTotal], ['TOTAL APPROVED MEMBERSHIPS', '', '', '', '', membershipTotal], ['GRAND TOTAL APPROVED', '', '', '', '', consultationTotal + membershipTotal]);

    // Section 2: Active plans snapshot
    sections.push([]);
    sections.push(['# ACTIVE PLANS']);
    sections.push(['Customer', 'Plan Tier', 'Started', 'Expires', 'Meetings Allowed', 'Meetings Left']);
    const now = Date.now();
    const memberships = database ? await database.all(`SELECT m.*, u.identifier AS identifier FROM memberships m LEFT JOIN users u ON u.id = m.userId`) : Array.from(store.memberships.entries()).map(([uid, m]) => ({ ...m, identifier: (store.users.get(uid) || {}).identifier || uid }));
    for (const m of memberships) {
      if (!m.active) continue;
      if (m.expiresAt && Number(m.expiresAt) < now) continue;
      sections.push([
        m.identifier || '',
        m.tier || '',
        m.startedAt ? new Date(Number(m.startedAt)).toISOString() : '',
        m.expiresAt ? new Date(Number(m.expiresAt)).toISOString() : '',
        Number(m.meetingsAllowed) || 0,
        m.meetingsLeft === null || m.meetingsLeft === undefined ? '' : Number(m.meetingsLeft),
      ]);
    }

    // Section 3: Appointments summary
    sections.push([]);
    sections.push(['# APPOINTMENTS']);
    sections.push(['Appointment ID', 'Date', 'Time', 'Type', 'Customer', 'Status']);
    const appointments = database
      ? await database.all(`SELECT a.*, u.identifier AS identifier FROM appointments a LEFT JOIN users u ON u.id = a.userId ORDER BY a.date ASC`)
      : Array.from(store.appointments.values()).map((a) => ({ ...a, identifier: (store.users.get(a.userId) || {}).identifier || a.userId }));
    for (const a of appointments) {
      sections.push([a.id, a.date || '', a.time || '', a.type || 'Consultation', a.identifier || '', a.status || 'Booked']);
    }

    // `sections` is already a flat list of CSV rows (each push adds one row).
    const csv = toCsv(sections);
    const filename = `shubh-sanjog-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send('\ufeff' + csv); // BOM so Excel opens UTF-8 correctly
  } catch (error) {
    console.error('export analytics error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// --- Internal notes (scope PDF §31) ------------------------------------------
// Notes are staff-only; every staff role may add, viewing requires the same.

router.get('/notes', verifyTokenMiddleware, requireStaffRole, listNotes);
router.post('/notes', verifyTokenMiddleware, requirePermission('addNotes'), addNote);

// --- Contact Us inquiries (Inquiry Management) --------------------------------
// GET /api/admin/inquiries?status=New|In Progress|Resolved — read the queue.
router.get('/inquiries', verifyTokenMiddleware, requirePermission('viewQueues'), listInquiries);
// POST /api/admin/inquiries/status { id, status, adminNote? } — triage an inquiry.
router.post('/inquiries/status', verifyTokenMiddleware, requirePermission('reviewProfiles'), updateInquiryStatus);

module.exports = router;
