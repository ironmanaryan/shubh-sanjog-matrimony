const express = require('express');
const router = express.Router();
const fs = require('fs');
const { verifyTokenMiddleware, requireAdmin } = require('../middleware/auth');
const { ROLES, ASSIGNABLE_ROLES, STAFF_ROLES, permissionsFor, requireStaffRole, requirePermission } = require('../middleware/rbac');
const { listNotes, addNote } = require('../controllers/internalNotesController');
const { listInquiries, updateInquiryStatus } = require('../controllers/inquiriesController');
const { store, activateMembership, getPlan } = require('../data/store');
const db = require('../db');
const { auditTrail, writeAuditLog, clientIp } = require('../utils/audit');

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
    manglik: profile?.personal?.manglikStatus || '',
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
router.get('/customers/:id', verifyTokenMiddleware, requireStaffRole, auditTrail('VIEW_PROFILE', (req) => req.params.id), async (req, res) => {
  try {
    const userId = String(req.params.id || '');
    const user = store.users.get(userId);
    let profile = store.profiles.get(userId) || null;
    try {
      const persisted = await db.getProfile(db._db, userId);
      if (persisted) profile = persisted;
    } catch (e) { console.warn('customer detail db lookup failed', e); }

    if (!user && !profile) return res.status(404).json({ ok: false, error: 'Customer not found' });

    let completion = Number(profile?.profileCompletion) || 0;
    try {
      const { calculateProfileCompletion } = require('../controllers/dashboardController');
      completion = calculateProfileCompletion(profile || {});
    } catch (e) { /* keep stored value */ }

    let assignments = [];
    try {
      assignments = await db.listMatchAssignmentsDb(db._db, userId);
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

    // PRD high-priority #1: when filtering for a specific customer, annotate each
    // candidate with that customer's real compatibility score (replaces the
    // random placeholder in the summary).
    if (req.query.customerId) {
      const customerProfile = store.profiles.get(String(req.query.customerId));
      const { computeCompatibility } = require('../utils/compatibility');
      for (const result of results) {
        const compatibility = computeCompatibility(customerProfile?.preferences || {}, {
          age: result.age,
          religion: result.religion,
          caste: result.caste,
          highestQualification: result.highestQualification,
          profession: result.profession,
          city: result.city,
          state: result.state,
          manglik: result.manglik,
        });
        result.matchScore = compatibility.score;
        result.matchReasons = compatibility.reasons.join(' · ');
      }
    }

    return res.json({ ok: true, count: results.length, candidates: results });
  } catch (error) {
    console.error('matching candidates error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /api/admin/match-assignment — assign/recommend a match to a customer.
// RBAC §29: admin + relationship_manager only (`manageMatches`).
router.post('/match-assignment', verifyTokenMiddleware, requirePermission('manageMatches'), auditTrail('MANAGE_MATCH', (req) => req.body?.customerId || null), async (req, res) => {
  try {
    const { customerId, candidateId, note = '' } = req.body || {};
    if (!customerId || !candidateId) return res.status(400).json({ ok: false, error: 'customerId and candidateId required' });

    const assignment = { id: require('uuid').v4(), customerId, candidateId, note, assignedBy: req.user.id, assignedAt: Date.now() };
    const assignments = store.matchAssignments.get(customerId) || [];
    assignments.push(assignment);
    store.matchAssignments.set(customerId, assignments);

    // persist + notify the customer (scope PDF §17 "New Match Assigned")
    try {
      await db.saveMatchAssignmentDb(db._db, assignment);
      const { v4: uuidv4 } = require('uuid');
      await db.saveNotificationDb(db._db, {
        id: uuidv4(),
        toUserId: customerId,
        fromUserId: req.user.id,
        type: 'new_match_assigned',
        payload: JSON.stringify({ assignmentId: assignment.id, candidateId }),
        at: Date.now(),
      });
      store.notifications.unshift({ id: require('uuid').v4(), toUserId: customerId, fromUserId: req.user.id, type: 'new_match_assigned', payload: JSON.stringify({ assignmentId: assignment.id, candidateId }), at: Date.now() });
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
    try { rows = await db.listMatchAssignmentsDb(db._db, req.query.customerId || null); } catch (e) { rows = Array.from(store.matchAssignments.values()).flat(); }
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

    const finalNote = note || fallbackNote;
    await db.setProfileReview(db._db, userId, { status: nextStatus, reviewNote: finalNote });

    // keep the hydrated store in sync
    const cached = store.profiles.get(userId);
    if (cached) {
      cached.status = nextStatus;
      cached.reviewNote = finalNote;
      cached.reviewedAt = Date.now();
      store.profiles.set(userId, cached);
    } else {
      const fresh = await db.getProfile(db._db, userId);
      if (fresh) store.profiles.set(userId, fresh);
    }

    const { v4: uuidv4 } = require('uuid');
    const type = nextStatus === 'Approved' ? 'profile_approved' : 'profile_rejected';
    const notification = { id: uuidv4(), toUserId: userId, fromUserId: req.user.id, type, payload: JSON.stringify({ status: nextStatus, note: finalNote }), at: Date.now() };
    await db.saveNotificationDb(db._db, notification);
    store.notifications.unshift(notification);

    return res.json({ ok: true, userId, status: nextStatus, reviewNote: finalNote });
  } catch (error) {
    console.error(`reviewProfile ${nextStatus} error`, error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// POST /api/admin/profiles/approve { userId, note? } — approval unmasks photo/contact per privacy rules
// RBAC §29: admin + relationship_manager (`reviewProfiles`); staff is read-only.
router.post('/profiles/approve', verifyTokenMiddleware, requirePermission('reviewProfiles'), auditTrail('UPDATE_STATUS', (req) => req.body?.userId || null), (req, res) => reviewProfile(req, res, 'Approved', null));
// POST /api/admin/profiles/reject { userId, reason }
router.post('/profiles/reject', verifyTokenMiddleware, requirePermission('reviewProfiles'), auditTrail('UPDATE_STATUS', (req) => req.body?.userId || null), (req, res) => reviewProfile(req, res, 'Rejected', 'No reason provided'));
// POST /api/admin/profiles/request-changes { userId, note } — back to Under Review with change request
router.post('/profiles/request-changes', verifyTokenMiddleware, requirePermission('reviewProfiles'), auditTrail('UPDATE_STATUS', (req) => req.body?.userId || null), (req, res) => reviewProfile(req, res, 'Under Review', 'Changes requested'));

// GET /api/admin/documents
router.get('/documents', verifyTokenMiddleware, requirePermission('viewQueues'), async (req, res) => {
  try {
    const rows = await db.listDocuments(db._db);
    const documents = rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      customerId: row.userId,
      customerName: displayNameOf(row.userId),
      customerIdentifier: store.users.get(row.userId)?.identifier || row.userId,
      documentType: row.documentType || (row.originalName?.includes('kundli') ? 'kundli' : 'identity'),
      status: row.status || 'Pending',
      rejectionReason: row.rejectionReason || null,
      originalName: row.originalName,
      uploadedAt: row.uploadedAt,
      mimetype: row.mimetype,
      size: row.size,
    }));
    return res.json({ ok: true, documents });
  } catch (error) {
    console.error('list admin documents error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /api/admin/documents/approve
router.post('/documents/approve', verifyTokenMiddleware, requirePermission('reviewProfiles'), auditTrail('UPDATE_STATUS', (req) => store.documents.get(req.body?.id)?.userId || null), async (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'id required' });
  const meta = store.documents.get(id);
  if (meta) meta.status = 'Approved';
  try {
    await db.setDocumentStatus(db._db, id, 'Approved', null);
  } catch (e) { console.warn('db set status failed', e); }
  return res.json({ ok: true, id, status: 'Approved' });
});

// POST /api/admin/documents/reject
router.post('/documents/reject', verifyTokenMiddleware, requirePermission('reviewProfiles'), auditTrail('UPDATE_STATUS', (req) => store.documents.get(req.body?.id)?.userId || null), async (req, res) => {
  const { id, reason } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'id required' });
  const meta = store.documents.get(id);
  if (meta) meta.status = 'Rejected';
  if (meta) meta.rejectionReason = reason || 'No reason provided';
  try {
    await db.setDocumentStatus(db._db, id, 'Rejected', reason || 'No reason provided');
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

// GET /api/admin/payments — every submitted manual UPI payment
router.get('/payments', verifyTokenMiddleware, requirePermission('viewQueues'), async (req, res) => {
  try {
    let payments = [];
    try { payments = await db.listPayments(db._db); } catch (e) { payments = Array.from(store.payments.values()); }
    const sorted = payments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return res.json({ ok: true, payments: sorted.map(paymentWithCustomer) });
  } catch (error) {
    console.error('list admin payments error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /api/admin/payments/approve { id } — verify the UTR and activate the purchased membership
// RBAC §29: admin only (`verifyPayments`) — staff/RM cannot touch money flows.
router.post('/payments/approve', verifyTokenMiddleware, requirePermission('verifyPayments'), auditTrail('UPDATE_STATUS', (req) => store.payments.get(req.body?.id)?.userId || null), async (req, res) => {
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
      await db.setPaymentStatus(db._db, id, 'Approved', null);
      await db.saveMembershipDb(db._db, payment.userId, membership, id);
      const { v4: uuidv4 } = require('uuid');
      const type = payment.plan === 'Consultation' ? 'payment_approved' : 'membership_activated';
      const notification = { id: uuidv4(), toUserId: payment.userId, fromUserId: req.user.id, type, payload: JSON.stringify({ paymentId: id, plan: payment.plan }), at: Date.now() };
      await db.saveNotificationDb(db._db, notification);
      store.notifications.unshift(notification);
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
router.post('/payments/reject', verifyTokenMiddleware, requirePermission('verifyPayments'), auditTrail('UPDATE_STATUS', (req) => store.payments.get(req.body?.id)?.userId || null), async (req, res) => {
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
      await db.setPaymentStatus(db._db, id, 'Rejected', finalReason);
      const { v4: uuidv4 } = require('uuid');
      const notification = { id: uuidv4(), toUserId: payment.userId, fromUserId: req.user.id, type: 'payment_rejected', payload: JSON.stringify({ paymentId: id, reason: finalReason }), at: Date.now() };
      await db.saveNotificationDb(db._db, notification);
      store.notifications.unshift(notification);
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
// When Cloudinary is configured, receipts are stored as CDN URLs and we redirect.
router.get('/payments/:id/receipt', verifyTokenMiddleware, requireStaffRole, auditTrail('VIEW_DOCUMENT', (req) => store.payments.get(req.params.id)?.userId || null), async (req, res) => {
  try {
    const payment = store.payments.get(req.params.id);
    if (!payment) return res.status(404).json({ ok: false, error: 'Payment not found' });
    const effectivePath = payment.cloudinaryUrl || payment.receiptPath;
    if (!effectivePath) return res.status(404).json({ ok: false, error: 'Receipt file not found' });
    // Cloudinary CDN URL — redirect so staff view via Cloudinary
    if (/^https?:\/\//.test(effectivePath)) {
      return res.redirect(302, effectivePath);
    }
    if (!fs.existsSync(effectivePath)) {
      return res.status(404).json({ ok: false, error: 'Receipt file not found' });
    }

    res.setHeader('Content-Type', payment.receiptMimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${payment.receiptName || 'receipt'}"`);
    const stream = fs.createReadStream(effectivePath);
    stream.on('error', () => res.status(500).end());
    stream.pipe(res);
  } catch (error) {
    console.error('receipt download error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// GET /api/admin/stats - overview metrics + attention-required items for the admin dashboard
// GET /api/admin/stats - overview metrics + attention-required items.
// Computed from the hydrated store (kept coherent by every write path), so the
// numbers are identical in MongoDB and SQLite modes without SQL per engine.
router.get('/stats', verifyTokenMiddleware, requirePermission('viewQueues'), async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const stats = {
      totalCustomers: 0,
      newCustomers: 0,
      activeMembers: 0,
      pendingDocuments: 0,
      approvedDocuments: 0,
      rejectedDocuments: 0,
      pendingProfiles: 0,
      approvedProfiles: 0,
      rejectedProfiles: 0,
      profilesCreated: store.profiles.size,
      avgProfileCompletion: 0,
      upcomingAppointments: 0,
      completedAppointments: 0,
      totalAppointments: store.appointments.size,
      pendingPayments: 0,
      approvedPayments: 0,
      rejectedPayments: 0,
      activeGoldMemberships: 0,
      activePremiumMemberships: 0,
      expiringMemberships: 0,
      revenueApproved: 0,
    };
    let completionSum = 0;

    for (const user of store.users.values()) {
      if (user.role === 'admin') continue;
      stats.totalCustomers += 1;
      if ((user.createdAt || 0) >= weekAgo) stats.newCustomers += 1;
    }

    for (const profile of store.profiles.values()) {
      completionSum += Number(profile.profileCompletion || 0);
      switch (profile.status || 'Draft') {
        case 'Submitted': stats.pendingProfiles += 1; break;
        case 'Under Review': stats.pendingProfiles += 1; break;
        case 'Approved': stats.approvedProfiles += 1; break;
        case 'Rejected': stats.rejectedProfiles += 1; break;
        default: break;
      }
    }
    stats.avgProfileCompletion = stats.profilesCreated > 0 ? Math.round(completionSum / stats.profilesCreated) : 0;

    for (const doc of store.documents.values()) {
      if (['Pending', 'Pending Review'].includes(doc.status)) stats.pendingDocuments += 1;
      else if (doc.status === 'Approved') stats.approvedDocuments += 1;
      else if (doc.status === 'Rejected') stats.rejectedDocuments += 1;
    }

    for (const appointment of store.appointments.values()) {
      if (appointment.status === 'Completed') { stats.completedAppointments += 1; continue; }
      if (appointment.status === 'Cancelled') continue;
      if (String(appointment.date) >= today) stats.upcomingAppointments += 1;
    }

    for (const payment of store.payments.values()) {
      const amount = Number(payment.amount || 0);
      if (payment.status === 'Approved') { stats.approvedPayments += 1; stats.revenueApproved += amount; }
      else if (payment.status === 'Rejected') stats.rejectedPayments += 1;
      else stats.pendingPayments += 1;
    }

    for (const m of store.memberships.values()) {
      if (!m || !m.active) continue;
      if (m.expiresAt && Number(m.expiresAt) < now) continue;
      stats.activeMembers += 1;
      if (m.tier === 'Gold') stats.activeGoldMemberships += 1;
      if (m.tier === 'Premium') stats.activePremiumMemberships += 1;
      if (m.expiresAt && Number(m.expiresAt) < now + 7 * 24 * 60 * 60 * 1000) stats.expiringMemberships += 1;
    }

    const nameOf = (userId) => displayNameOf(userId);

    const pendingDocuments = Array.from(store.documents.values())
      .filter((d) => ['Pending', 'Pending Review'].includes(d.status))
      .sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0))
      .slice(0, 5)
      .map((d) => ({ id: d.id, originalName: d.originalName, uploadedAt: d.uploadedAt, customerName: nameOf(d.userId) }));

    const pendingProfiles = Array.from(store.profiles.values())
      .filter((p) => p.status === 'Submitted')
      .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))
      .slice(0, 5)
      .map((p) => ({ id: p.userId, submittedAt: p.submittedAt, profileCompletion: p.profileCompletion || 0, customerName: nameOf(p.userId) }));

    const upcomingAppointments = Array.from(store.appointments.values())
      .filter((a) => a.status !== 'Cancelled' && a.status !== 'Completed' && String(a.date) >= today)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 5)
      .map((a) => ({ id: a.id, date: a.date, time: a.time, type: a.type, customerName: nameOf(a.userId) }));

    const recentCustomers = Array.from(store.users.values())
      .filter((u) => u.role !== 'admin')
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 5)
      .map((u) => ({ id: u.id, identifier: u.identifier, createdAt: u.createdAt }));

    const pendingPayments = Array.from(store.payments.values())
      .filter((p) => p.status === 'Pending Verification' || p.status === 'Paid')
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 5)
      .map((p) => ({ id: p.id, plan: p.plan, amount: p.amount, createdAt: p.createdAt, customerName: nameOf(p.userId) }));

    return res.json({
      ok: true,
      stats,
      attention: { pendingDocuments, upcomingAppointments, recentCustomers, pendingPayments, pendingProfiles },
    });
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
router.post('/team/role', verifyTokenMiddleware, requirePermission('manageTeam'), auditTrail('CHANGE_ROLE', (req) => req.body?.userId || null), async (req, res) => {
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
      updated = await db.setUserRole(db._db, userId, role);
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
// GET /api/admin/analytics — revenue split (Consultation vs Memberships),
// active plan counts, appointment stats. Computed from the hydrated store so
// MongoDB and SQLite modes behave identically.
router.get('/analytics', verifyTokenMiddleware, requirePermission('viewAnalytics'), async (req, res) => {
  try {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);

    const analytics = {
      revenue: { consultation: 0, memberships: 0, gold: 0, premium: 0, total: 0, approvedPaymentsCount: 0 },
      activePlans: { consultation: 0, gold: 0, premium: 0, total: 0 },
      appointments: { total: store.appointments.size, booked: 0, completed: 0, cancelled: 0, upcoming: 0 },
      paymentsByStatus: { approved: 0, pending: 0, rejected: 0 },
      customers: { total: Array.from(store.users.values()).filter((u) => u.role === 'customer').length },
    };
    const isMembershipPlanTier = (tier) => tier === 'Gold' || tier === 'Premium';

    for (const payment of store.payments.values()) {
      const amount = Number(payment.amount || 0);
      if (payment.status === 'Approved') {
        analytics.revenue.approvedPaymentsCount += 1;
        analytics.revenue.total += amount;
        if (isMembershipPlanTier(payment.plan)) {
          analytics.revenue.memberships += amount;
          if (payment.plan === 'Gold') analytics.revenue.gold += amount;
          if (payment.plan === 'Premium') analytics.revenue.premium += amount;
        } else {
          analytics.revenue.consultation += amount;
        }
        analytics.paymentsByStatus.approved += 1;
      } else if (/reject/i.test(String(payment.status))) {
        analytics.paymentsByStatus.rejected += 1;
      } else {
        analytics.paymentsByStatus.pending += 1;
      }
    }

    for (const m of store.memberships.values()) {
      if (!m || !m.active) continue;
      if (m.expiresAt && Number(m.expiresAt) < now) continue;
      analytics.activePlans.total += 1;
      if (isMembershipPlanTier(m.tier)) analytics.activePlans[String(m.tier).toLowerCase()] += 1;
      else analytics.activePlans.consultation += 1;
    }

    for (const a of store.appointments.values()) {
      if (a.status === 'Completed') { analytics.appointments.completed += 1; continue; }
      if (a.status === 'Cancelled') { analytics.appointments.cancelled += 1; continue; }
      analytics.appointments.booked += 1;
      if (String(a.date) >= today) analytics.appointments.upcoming += 1;
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
    const sections = [];

    sections.push(['# Shubh Sanjog Matrimony — Analytics Export']);
    sections.push([`# Generated ${new Date().toISOString()}`]);

    // Section 1: Revenue ledger (all payments with status) — storage-agnostic
    // via the shared driver + hydrated store for display names.
    sections.push([]);
    sections.push(['# REVENUE LEDGER (PAYMENTS)']);
    sections.push(['Payment ID', 'Date', 'Customer', 'Plan', 'Category', 'Amount (INR)', 'Status']);
    let payments = [];
    try { payments = await db.listPayments(db._db); } catch { payments = Array.from(store.payments.values()); }
    payments = payments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    let consultationTotal = 0;
    let membershipTotal = 0;
    for (const p of payments) {
      const category = p.plan === 'Gold' || p.plan === 'Premium' ? 'Membership' : 'Consultation';
      if (p.status === 'Approved') {
        if (category === 'Membership') membershipTotal += Number(p.amount) || 0;
        else consultationTotal += Number(p.amount) || 0;
      }
      sections.push([p.id, new Date(p.createdAt || 0).toISOString(), store.users.get(p.userId)?.identifier || '', p.plan || '', category, Number(p.amount) || 0, p.status || 'Pending Verification']);
    }
    sections.push([], ['TOTAL APPROVED CONSULTATION', '', '', '', '', consultationTotal], ['TOTAL APPROVED MEMBERSHIPS', '', '', '', '', membershipTotal], ['GRAND TOTAL APPROVED', '', '', '', '', consultationTotal + membershipTotal]);

    // Section 2: Active plans snapshot
    sections.push([]);
    sections.push(['# ACTIVE PLANS']);
    sections.push(['Customer', 'Plan Tier', 'Started', 'Expires', 'Meetings Allowed', 'Meetings Left']);
    const now = Date.now();
    for (const m of store.memberships.values()) {
      if (!m.active) continue;
      if (m.expiresAt && Number(m.expiresAt) < now) continue;
      sections.push([
        store.users.get(m.userId)?.identifier || m.userId || '',
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
    const appointments = Array.from(store.appointments.values()).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    for (const a of appointments) {
      sections.push([a.id, a.date || '', a.time || '', a.type || 'Consultation', displayNameOf(a.userId), a.status || 'Booked']);
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
router.post('/notes', verifyTokenMiddleware, requirePermission('addNotes'), auditTrail('ADD_NOTE', (req) => req.body?.targetId || null), addNote);

// --- Contact Us inquiries (Inquiry Management) --------------------------------
// GET /api/admin/inquiries?status=New|In Progress|Resolved — read the queue.
router.get('/inquiries', verifyTokenMiddleware, requirePermission('viewQueues'), listInquiries);
// POST /api/admin/inquiries/status { id, status, adminNote? } — triage an inquiry.
router.post('/inquiries/status', verifyTokenMiddleware, requirePermission('reviewProfiles'), updateInquiryStatus);

// --- Audit log viewer (privacy spec §31) --------------------------------------
// ADMIN role ONLY (not RM/staff): every administrative access to or change of
// user sensitive data is listed here. Supports action / target-user / date
// range filters. Falls back to the in-memory trail when SQLite is unavailable.
const AUDIT_ACTIONS = ['VIEW_DOCUMENT', 'VIEW_PROFILE', 'UPDATE_STATUS', 'DELETE_ACCOUNT', 'CHANGE_ROLE', 'ADD_NOTE', 'MANAGE_MATCH'];

router.get('/audit-logs', verifyTokenMiddleware, requireAdmin, async (req, res) => {
  try {
    const { action, targetUserId, from, to } = req.query || {};
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    let logs = [];
    try {
      logs = await db.listAuditLogsDb(db._db, {
        targetUserId: targetUserId ? String(targetUserId) : null,
        action: action ? String(action) : null,
        from: from ? Date.parse(String(from)) : null,
        // "to" is inclusive: advance to the end of the selected day.
        to: to ? Date.parse(String(to)) + 86399999 : null,
        limit,
      });
    } catch (e) {
      console.warn('audit-logs db read failed, using in-memory trail', e);
      const fromMs = from ? Date.parse(String(from)) : null;
      const toMs = to ? Date.parse(String(to)) + 86399999 : null;
      logs = store.auditLogs
        .filter((entry) => (!action || entry.action === action))
        .filter((entry) => (!targetUserId || entry.targetUserId === targetUserId))
        .filter((entry) => (fromMs == null || Number(entry.createdAt) >= fromMs))
        .filter((entry) => (toMs == null || Number(entry.createdAt) <= toMs))
        .slice(-limit)
        .reverse();
    }

    // Filter dropdown options: known actions + any distinct actions present.
    const actions = [...new Set([...AUDIT_ACTIONS, ...store.auditLogs.map((l) => l.action), ...logs.map((l) => l.action)])].sort();

    return res.json({ ok: true, logs, actions });
  } catch (err) {
    console.error('audit-logs error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// --- Admin user management (PRD §3/§4): hard "Delete user profile" ------------
// Permanently removes the customer and every associated record (profile,
// documents, appointments, interests, memberships, payments, notes,
// notifications) from the database. Full-admin only; audited.
router.delete('/users/:id', verifyTokenMiddleware, requireAdmin, auditTrail('UPDATE_STATUS', (req) => req.params.id), async (req, res) => {
  try {
    const userId = String(req.params.id || '');
    const user = store.users.get(userId) || (await db.getUserById(db._db, userId));
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    if (user.id === req.user.id) return res.status(400).json({ ok: false, error: 'You cannot delete your own account' });
    if ((user.role || 'customer') === 'admin') return res.status(403).json({ ok: false, error: 'Admin accounts cannot be deleted here' });

    const result = await db.deleteUserCascade(db._db, userId);
    for (const filePath of result.files || []) {
      try { require('fs').unlink(filePath, () => {}); } catch { /* already gone */ }
    }

    // Mirror the purge into the hydrated store for immediate effect.
    store.users.delete(userId);
    store.profiles.delete(userId);
    store.shortlists.delete(userId);
    store.interests.delete(userId);
    store.memberships.delete(userId);
    store.appointments.delete(userId);
    store.matchAssignments.delete(userId);
    for (const [id, meta] of Array.from(store.documents.entries())) if (meta.userId === userId) store.documents.delete(id);
    for (const [id, p] of Array.from(store.payments.entries())) if (p.userId === userId) store.payments.delete(id);
    store.notifications = store.notifications.filter((n) => n.toUserId !== userId && n.fromUserId !== userId);
    store.interestRequests = store.interestRequests.filter((r) => r.fromUserId !== userId && r.toProfileId !== userId);

    await writeAuditLog({
      actorId: req.user.id,
      action: 'DELETE_ACCOUNT',
      targetUserId: userId,
      ip: clientIp(req),
      detail: `Admin permanently deleted user ${user.identifier} and all associated records (${(result.files || []).length} file(s) removed).`,
    });

    return res.json({ ok: true, message: 'User and all associated data permanently deleted.', removedFiles: (result.files || []).length });
  } catch (err) {
    console.error('admin delete user error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

module.exports = router;
