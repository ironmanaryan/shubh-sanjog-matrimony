const { store } = require('../data/store');
const db = require('../db');
const { calculateProfileCompletion } = require('./dashboardController');

function upsertProfile(userId, data) {
  const existing = store.profiles.get(userId) || {};
  const next = { ...existing, ...data, updatedAt: Date.now() };
  store.profiles.set(userId, next);
  return next;
}

async function getProfile(req, res) {
  try {
    // try DB first
    if (db._db) {
      const p = await db.getProfile(db._db, req.user.id);
      if (p) return res.json({ ok: true, profile: p });
    }
  } catch (err) {
    console.error('getProfile db error', err);
  }

  const profile = store.profiles.get(req.user.id) || {};
  return res.json({ ok: true, profile });
}

async function saveProfile(req, res) {
  const data = req.body || {};
  const existing = store.profiles.get(req.user.id) || {};
  const profile = {
    ...existing,
    ...data,
    updatedAt: Date.now(),
  };

  // deep-merge biodata sections so partial payloads never erase saved fields
  for (const section of ['personal', 'education', 'family', 'preferences']) {
    if (data[section] && typeof data[section] === 'object') {
      profile[section] = { ...(existing[section] || {}), ...data[section] };
    }
  }

  // a rejected profile returns to Draft when edited, so it can be resubmitted for review
  if (profile.status === 'Rejected') {
    profile.status = 'Draft';
  }

  // calculate and attach profile completion score
  try {
    const score = calculateProfileCompletion(profile);
    profile.profileCompletion = score;
  } catch (e) {
    console.warn('calculateProfileCompletion failed', e);
  }

  store.profiles.set(req.user.id, profile);

  try {
    if (db._db) await db.upsertProfile(db._db, req.user.id, profile);
  } catch (e) {
    console.warn('db upsert profile failed', e);
  }

  return res.json({ ok: true, profile });
}

async function savePersonal(req, res) {
  const data = req.body || {};
  // merge with the existing section so step-by-step saves never wipe fields saved elsewhere
  const existing = store.profiles.get(req.user.id) || {};
  const profile = upsertProfile(req.user.id, { personal: { ...(existing.personal || {}), ...data } });
  // persist
  try {
    if (db._db) await db.upsertProfile(db._db, req.user.id, store.profiles.get(req.user.id));
  } catch (e) {
    console.warn('db upsert personal failed', e);
  }
  return res.json({ ok: true, profile });
}

async function saveEducation(req, res) {
  const data = req.body || {};
  const existing = store.profiles.get(req.user.id) || {};
  const profile = upsertProfile(req.user.id, { education: { ...(existing.education || {}), ...data } });
  try {
    if (db._db) await db.upsertProfile(db._db, req.user.id, store.profiles.get(req.user.id));
  } catch (e) {
    console.warn('db upsert education failed', e);
  }
  return res.json({ ok: true, profile });
}

async function saveFamily(req, res) {
  const data = req.body || {};
  const existing = store.profiles.get(req.user.id) || {};
  const profile = upsertProfile(req.user.id, { family: { ...(existing.family || {}), ...data } });
  try {
    if (db._db) await db.upsertProfile(db._db, req.user.id, store.profiles.get(req.user.id));
  } catch (e) {
    console.warn('db upsert family failed', e);
  }
  return res.json({ ok: true, profile });
}

async function savePreferences(req, res) {
  const data = req.body || {};
  const existing = store.profiles.get(req.user.id) || {};
  const profile = upsertProfile(req.user.id, { preferences: { ...(existing.preferences || {}), ...data } });
  try {
    if (db._db) await db.upsertProfile(db._db, req.user.id, store.profiles.get(req.user.id));
  } catch (e) {
    console.warn('db upsert preferences failed', e);
  }
  return res.json({ ok: true, profile });
}

// POST /api/profile/submit — customer submits biodata for admin review (scope PDF §22)
async function submitForReview(req, res) {
  try {
    const userId = req.user.id;
    let profile = store.profiles.get(userId);
    if (db._db) {
      const persisted = await db.getProfile(db._db, userId);
      if (persisted) profile = persisted;
    }
    if (!profile) return res.status(400).json({ ok: false, error: 'Create your profile before submitting for review' });
    if (profile.status === 'Approved') return res.status(409).json({ ok: false, error: 'Profile is already approved' });

    const completion = Number(profile.profileCompletion || calculateProfileCompletion(profile));
    if (completion < 60) {
      return res.status(400).json({ ok: false, error: 'Complete at least 60% of your profile before submitting for review', profileCompletion: completion });
    }

    if (db._db) await db.submitProfileForReviewDb(db._db, userId, completion);
    profile.status = 'Submitted';
    profile.reviewNote = null;
    profile.submittedAt = Date.now();
    store.profiles.set(userId, profile);

    // notify admins is implicit via queue; notify customer of submission
    try {
      if (db._db) {
        await db._db.run(
          `INSERT INTO notifications (id, toUserId, fromUserId, type, payload, at) VALUES (?, ?, ?, ?, ?, ?);`,
          [require('uuid').v4(), userId, userId, 'profile_submitted', JSON.stringify({ profileCompletion: completion }), Date.now()]
        );
      }
    } catch (e) { console.warn('submit notification failed', e); }

    return res.json({ ok: true, status: 'Submitted', profileCompletion: completion });
  } catch (err) {
    console.error('submitForReview', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = { getProfile, saveProfile, savePersonal, saveEducation, saveFamily, savePreferences, submitForReview };
