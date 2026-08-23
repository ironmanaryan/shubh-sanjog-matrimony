// Onboarding enforcer (PRD §3).
//
// Guides new members through the mandated funnel:
//   Registration -> OTP -> Biodata -> Family Details -> Partner Preferences ->
//   Upload Docs -> Submit Profile -> Admin Review -> (Approved) -> Payments,
//   Matching, Meetings.
//
// Customer endpoints past the profile-building stage call these guards. Every
// rejection carries a machine-readable `nextStep` so the frontend can route
// the member to exactly the screen that unblocks them.

const { store } = require('../data/store');
const db = require('../db');

function normalizeStatus(status) {
  return status || 'Draft';
}

// Full stage snapshot for one customer — also consumed by GET /onboarding/status.
async function getOnboardingStatus(userId) {
  let profile = store.profiles.get(userId) || null;
  if (!profile) {
    try { profile = await db.getProfile(db._db, userId); } catch (e) { /* store fallback */ }
  }

  const personal = profile?.personal || {};
  const education = profile?.education || {};
  const family = profile?.family || {};
  const preferences = profile?.preferences || {};

  const hasBiodata = Boolean(
    String(personal.firstName || '').trim() &&
    String(personal.lastName || '').trim() &&
    String(personal.gender || '').trim() &&
    String(personal.dob || '').trim()
  );
  const hasEducation = Boolean(String(education.highestQualification || '').trim() || String(education.profession || '').trim());
  const hasFamily = Boolean(String(family.fatherName || '').trim() || String(family.motherName || '').trim() || family.numberOfBrothers !== undefined || family.numberOfSisters !== undefined);
  const hasPreferences = Boolean(
    String(preferences.preferredGender || '').trim() ||
    preferences.minAge !== undefined ||
    String(preferences.religion || '').trim() ||
    String(preferences.location || '').trim()
  );
  let documentsCount = 0;
  for (const doc of store.documents.values()) if (doc.userId === userId) documentsCount += 1;

  const status = normalizeStatus(profile?.status);
  // Recompute completion live so the tracker reflects the latest saves —
  // per-section endpoints persist sections but only PUT /profile recomputes.
  let profileCompletion = Number(profile?.profileCompletion || 0);
  try {
    const { calculateProfileCompletion } = require('../controllers/dashboardController');
    profileCompletion = calculateProfileCompletion(profile || {});
  } catch (e) { /* keep persisted value */ }
  const steps = [
    { key: 'registration', label: 'Registration', done: true },
    { key: 'otp', label: 'OTP verification', done: true },
    { key: 'biodata', label: 'Create matrimonial profile', done: hasBiodata && hasEducation },
    { key: 'family', label: 'Add family details', done: hasFamily },
    { key: 'preferences', label: 'Add partner preferences', done: hasPreferences },
    { key: 'documents', label: 'Upload documents / horoscope', done: documentsCount > 0 },
    { key: 'submit', label: 'Submit profile for review', done: ['Submitted', 'Under Review', 'Approved'].includes(status) },
    { key: 'admin_review', label: 'Admin review & approval', done: status === 'Approved' },
    { key: 'membership', label: 'Select consultation / membership', done: ['Submitted', 'Under Review', 'Approved'].includes(status) },
  ];
  const firstIncomplete = steps.find((s) => !s.done);

  return {
    profileStatus: status,
    profileCompletion,
    documentsCount,
    steps,
    nextStep: firstIncomplete ? firstIncomplete.key : 'matching',
    approved: status === 'Approved',
  };
}

function stepForStatus(status) {
  switch (normalizeStatus(status)) {
    case 'Draft': return 'submit_profile';
    case 'Submitted':
    case 'Under Review': return 'await_review';
    case 'Rejected': return 'fix_profile';
    default: return null;
  }
}

// Factory: allows the request only when the caller's profile status is one of
// `allowed`. Attaches onboarding hints to every rejection.
function requireProfileStatus(...allowed) {
  return async function requireProfileStatusMiddleware(req, res, next) {
    try {
      const userId = req.user.id;
      let profile = store.profiles.get(userId) || null;
      if (!profile) {
        try { profile = await db.getProfile(db._db, userId); } catch (e) { /* ignore */ }
      }
      const status = normalizeStatus(profile?.status);
      if (!profile || !allowed.includes(status)) {
        return res.status(403).json({
          ok: false,
          error: !profile
            ? 'Create your matrimonial profile first.'
            : status === 'Rejected'
              ? 'Your profile needs changes before you can continue — update and resubmit it.'
              : 'This unlocks after your profile is submitted and approved by our team.',
          nextStep: stepForStatus(status),
          profileStatus: status,
          profileCompletion: Number(profile?.profileCompletion || 0),
        });
      }
      req.profile = profile;
      return next();
    } catch (err) {
      console.error('requireProfileStatus error', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  };
}

module.exports = { getOnboardingStatus, requireProfileStatus, stepForStatus };
