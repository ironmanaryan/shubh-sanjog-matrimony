const express = require('express');
const router = express.Router();
const fs = require('fs');
const { verifyTokenMiddleware } = require('../middleware/auth');
const { isStaffRole } = require('../middleware/rbac');
const { store, getPrivacySettings, setPrivacySettings } = require('../data/store');
const { calculateProfileCompletion } = require('../controllers/dashboardController');
const { writeAuditLog, clientIp } = require('../utils/audit');
const db = require('../db');

async function getCustomerProfile(req, res) {
  try {
    if (db._db) {
      const profile = await db.getProfile(db._db, req.user.id);
      if (profile) {
        const completion = calculateProfileCompletion(profile);
        profile.profileCompletion = completion;
        return res.json({ ok: true, profile });
      }
    }

    const profile = store.profiles.get(req.user.id) || {};
    profile.profileCompletion = calculateProfileCompletion(profile);
    return res.json({ ok: true, profile });
  } catch (err) {
    console.error('getCustomerProfile error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

async function updateCustomerProfile(req, res) {
  try {
    const nextProfile = req.body || {};
    const current = store.profiles.get(req.user.id) || {};
    // deep-merge each biodata section so partial updates never erase saved fields
    const merged = {
      ...current,
      ...nextProfile,
      userId: req.user.id,
      updatedAt: Date.now(),
    };
    for (const section of ['personal', 'education', 'family', 'preferences']) {
      if (nextProfile[section] && typeof nextProfile[section] === 'object') {
        merged[section] = { ...(current[section] || {}), ...nextProfile[section] };
      }
    }
    merged.profileCompletion = calculateProfileCompletion(merged);
    store.profiles.set(req.user.id, merged);

    try {
      if (db._db) await db.upsertProfile(db._db, req.user.id, merged);
    } catch (e) {
      console.warn('customer profile persist failed', e);
    }

    return res.json({ ok: true, profile: merged });
  } catch (err) {
    console.error('updateCustomerProfile error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// GET /api/customer/privacy — current privacy toggles
async function getPrivacy(req, res) {
  try {
    let privacy = getPrivacySettings(req.user.id);
    try {
      if (db._db) {
        const profile = await db.getProfile(db._db, req.user.id);
        if (profile && profile.privacy) {
          privacy = {
            hidePhoto: profile.privacy.hidePhoto === true,
            hidePhone: profile.privacy.hidePhone === true,
          };
        }
      }
    } catch (e) { /* fall back to store */ }
    return res.json({ ok: true, privacy });
  } catch (err) {
    console.error('getPrivacy error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// PUT /api/customer/privacy { hidePhoto, hidePhone } — toggles hide photo/phone until interest accepted
async function updatePrivacy(req, res) {
  try {
    const body = req.body || {};
    const privacy = setPrivacySettings(req.user.id, {
      hidePhoto: body.hidePhoto === true,
      hidePhone: body.hidePhone === true,
    });

    // keep the merged in-store profile in sync and persist the privacy column
    const merged = store.profiles.get(req.user.id) || {};
    merged.privacy = { ...privacy };
    store.profiles.set(req.user.id, merged);
    try {
      if (db._db) await db.savePrivacyDb(db._db, req.user.id, privacy);
    } catch (e) {
      console.warn('privacy persist failed', e);
    }

    return res.json({ ok: true, privacy });
  } catch (err) {
    console.error('updatePrivacy error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// POST /api/customer/delete-account — account deletion & anonymization
// (privacy spec §32). The authenticated customer requests deletion of their
// own account: all PII is purged or anonymized, uploaded files are removed
// from disk, and every active auth session is revoked. Financial rows keep
// only the minimum required for accounting (amount/plan/status/UTR/date).
async function deleteAccount(req, res) {
  try {
    // Staff accounts are managed through the admin console, not self-service.
    if (isStaffRole(req.user.role)) {
      return res.status(403).json({ ok: false, error: 'Staff accounts cannot be deleted here.' });
    }

    const userId = req.user.id;
    const user = store.users.get(userId);
    const originalIdentifier = user?.identifier || null;

    // 1) Purge / anonymize persisted data and collect file paths to remove.
    let files = [];
    if (db._db) {
      const result = await db.anonymizeAndPurgeUser(db._db, userId);
      files = result.files || [];
    }

    // 2) Remove uploaded files from disk (best-effort — never blocks deletion).
    for (const filePath of files) {
      try { fs.unlink(filePath, () => {}); } catch { /* already gone */ }
    }

    // 3) Mirror the purge into the in-memory store.
    for (const [id, meta] of Array.from(store.documents.entries())) {
      if (meta.userId === userId) {
        store.documents.delete(id);
        try { fs.unlinkSync(meta.path); } catch { /* already gone */ }
      }
    }
    for (const [id, payment] of Array.from(store.payments.entries())) {
      if (payment.userId === userId) {
        store.payments.set(id, {
          ...payment,
          upiId: null,
          receiptPath: null,
          receiptName: null,
          receiptMimetype: null,
          receiptSize: null,
        });
      }
    }
    store.profiles.delete(userId);
    store.shortlists.delete(userId);
    store.interests.delete(userId);
    store.memberships.delete(userId);
    store.appointments.delete(userId);
    store.matchAssignments.delete(userId);
    store.notifications = store.notifications.filter((n) => n.toUserId !== userId && n.fromUserId !== userId);
    store.interestRequests = store.interestRequests.filter((r) => r.fromUserId !== userId && r.toProfileId !== userId);
    // Drop any pending OTPs tied to the original identifier.
    if (originalIdentifier) store.otps.delete(originalIdentifier);

    // 4) Anonymize the in-memory user row to match the database.
    if (user) {
      user.identifier = `deleted-${userId}@anonymized.invalid`;
      user.email = null;
      user.deletedAt = Date.now();
      store.users.set(userId, user);
    }

    // 5) Revoke ALL sessions: any JWT issued before now is rejected by the
    // auth middleware, and deletedAt ensures no new session can be minted.
    const revokedAt = Date.now();
    store.tokenRevocations.set(userId, revokedAt);
    try {
      if (db._db) await db.setTokenRevocationDb(db._db, userId, revokedAt);
    } catch (e) {
      console.warn('token revocation persist failed', e);
    }

    // 6) Audit the deletion itself.
    await writeAuditLog({
      actorId: userId,
      action: 'DELETE_ACCOUNT',
      targetUserId: userId,
      ip: clientIp(req),
      detail: `Customer requested account deletion; ${files.length} file(s) removed and data anonymized.`,
    });

    return res.json({
      ok: true,
      message: 'Your account has been deleted and your personal data anonymized. All sessions have been signed out.',
    });
  } catch (err) {
    console.error('deleteAccount error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// GET /api/customer/activity — unified recent-activity stream for the signed-in
// customer (privacy spec: strictly self-scoped). Aggregates the user's own
// events across payments, appointments, documents, interests, profile review
// and match assignments into one chronological timeline. Reads the hydrated
// in-memory store (kept in sync by every controller), so no new tables are
// needed; data survives restarts via hydrateStore().
function buildActivityFeed(userId, limit = 50) {
  const items = [];
  const push = (id, type, title, detail, at) => {
    if (!at) return;
    items.push({ id, type, title, detail: detail || '', at });
  };

  // Payments — submitted / verified / rejected
  for (const [id, p] of store.payments.entries()) {
    if (p.userId !== userId) continue;
    const amount = p.amount ? ` — ₹${Number(p.amount).toLocaleString('en-IN')}` : '';
    push(`pay-${id}`, 'payment', `Payment submitted — ${p.plan || 'plan'}${amount}`, `Status: ${p.status || 'Pending Verification'}`, p.createdAt);
    if (p.status === 'Approved') push(`pay-ok-${id}`, 'payment', `Payment approved — ${p.plan || 'plan'}`, 'Membership activated.', p.reviewedAt);
    if (p.status === 'Rejected') push(`pay-no-${id}`, 'payment', `Payment rejected — ${p.plan || 'plan'}`, p.rejectionReason || 'UTR could not be verified.', p.reviewedAt);
  }

  // Appointments
  for (const [id, a] of store.appointments.entries()) {
    if (a.userId !== userId) continue;
    const slot = [a.date, a.time].filter(Boolean).join(', ');
    push(`apt-${id}`, 'appointment', `Appointment booked${a.type ? ` — ${a.type}` : ''}${slot ? ` (${slot})` : ''}`, `Status: ${a.status || 'Booked'}`, a.createdAt);
  }

  // Documents — upload + verification outcomes
  for (const [id, d] of store.documents.entries()) {
    if (d.userId !== userId) continue;
    const label = `${d.documentType || 'Document'} · ${d.originalName || ''}`;
    push(`doc-${id}`, 'document', `Document uploaded — ${label.trim()}`, 'Pending review.', d.uploadedAt);
    if (d.status === 'Approved') push(`doc-ok-${id}`, 'document', `Document approved — ${d.documentType || 'file'}`, '', d.reviewedAt || d.uploadedAt);
    if (d.status === 'Rejected') push(`doc-no-${id}`, 'document', `Document rejected — ${d.documentType || 'file'}`, d.rejectionReason || 'Please re-upload.', d.reviewedAt || d.uploadedAt);
  }

  // Interests sent & received
  for (const r of store.interestRequests) {
    if (r.fromUserId !== userId && r.toProfileId !== userId) continue;
    const direction = r.fromUserId === userId ? 'expressed in' : 'received from';
    const other = r.fromUserId === userId ? r.toProfileId : r.fromUserId;
    const shortId = String(other || '').slice(0, 8);
    push(`int-${r.id}`, 'interest', `Interest ${direction} profile ${shortId}…`, `Status: ${r.status || 'Pending'}`, r.createdAt);
    if (r.respondedAt) {
      push(`int-res-${r.id}`, 'interest', `Interest ${String(r.status || '').toLowerCase()} — profile ${shortId}…`, '', r.respondedAt);
    }
  }

  // Profile lifecycle
  const profile = store.profiles.get(userId);
  if (profile) {
    push('prof-sub', 'profile', 'Profile submitted for admin review', `Status: ${profile.status || 'Draft'}`, profile.submittedAt);
    if (profile.status === 'Approved') push('prof-ok', 'profile', 'Profile approved', 'Your profile is now visible for matching.', profile.reviewedAt);
    if (profile.status === 'Rejected') push('prof-no', 'profile', 'Profile rejected', profile.reviewNote || 'Contact the bureau for details.', profile.reviewedAt);
  }

  // Match assignments
  const assignments = store.matchAssignments.get(userId);
  if (Array.isArray(assignments)) {
    for (const [i, m] of assignments.entries()) {
      push(`match-${i}-${m.assignedAt}`, 'match', 'New match assigned', `Candidate ${String(m.candidateId || '').slice(0, 8)}…${m.note ? ` · ${m.note}` : ''}`, m.assignedAt);
    }
  }

  items.sort((a, b) => Number(b.at) - Number(a.at));
  return items.slice(0, limit);
}

async function getActivity(req, res) {
  try {
    return res.json({ ok: true, items: buildActivityFeed(req.user.id) });
  } catch (err) {
    console.error('getActivity error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

router.get('/profile', verifyTokenMiddleware, getCustomerProfile);
router.put('/profile', verifyTokenMiddleware, updateCustomerProfile);
// GET /api/customer/onboarding-status — PRD funnel snapshot (Registration ->
// OTP -> Biodata -> Family -> Preferences -> Docs -> Submit -> Admin Review).
// The dashboard renders this as the step-by-step progress tracker.
router.get('/onboarding-status', verifyTokenMiddleware, async (req, res) => {
  try {
    const { getOnboardingStatus } = require('../middleware/onboarding');
    const status = await getOnboardingStatus(req.user.id);
    return res.json({ ok: true, onboarding: status });
  } catch (err) {
    console.error('onboarding-status error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});
router.get('/privacy', verifyTokenMiddleware, getPrivacy);
router.put('/privacy', verifyTokenMiddleware, updatePrivacy);
router.post('/delete-account', verifyTokenMiddleware, deleteAccount);
router.get('/activity', verifyTokenMiddleware, getActivity);

/**
 * POST /api/customer/activity-log — self-report a non-customer-server action
 * (e.g. avatar upload to Supabase Storage from the browser) so it shows up in
 * the admin live-activity feed. Body: { action, detail? }.
 *
 * The action must be in the allowlist below — this is a SECURITY surface
 * (anything we log here is visible to admins), so unsanctioned actions are
 * quietly rejected with 400.
 */
const CUSTOMER_ACTIVITY_ACTIONS = new Set([
  'PROFILE_PHOTO_CHANGE',
  'PROFILE_PHOTO_REMOVE',
  'PROFILE_UPDATE',
  'UPLOAD_DOCUMENT',
  'DELETE_DOCUMENT',
]);
router.post('/activity-log', verifyTokenMiddleware, async (req, res) => {
  try {
    const action = String(req.body?.action || '').trim();
    if (!CUSTOMER_ACTIVITY_ACTIONS.has(action)) {
      return res.status(400).json({ ok: false, error: 'Unknown action' });
    }
    const detail = String(req.body?.detail || '').slice(0, 500);
    writeAuditLog({
      actorId: req.user.id,
      action,
      targetUserId: req.user.id,
      ip: clientIp(req),
      detail,
    }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) {
    console.error('customer activity-log', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

module.exports = router;
