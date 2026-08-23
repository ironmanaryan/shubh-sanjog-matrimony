const express = require('express');
const router = express.Router();
const { verifyTokenMiddleware } = require('../middleware/auth');
const { store, getPrivacySettings, setPrivacySettings } = require('../data/store');
const { calculateProfileCompletion } = require('../controllers/dashboardController');
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

router.get('/profile', verifyTokenMiddleware, getCustomerProfile);
router.put('/profile', verifyTokenMiddleware, updateCustomerProfile);
router.get('/privacy', verifyTokenMiddleware, getPrivacy);
router.put('/privacy', verifyTokenMiddleware, updatePrivacy);

module.exports = router;
