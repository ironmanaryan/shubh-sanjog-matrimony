const { store, applyUsage, getPrivacySettings } = require('../data/store');
const db = require('../db');

// Toggle shortlist for the authenticated user
async function toggleShortlist(req, res) {
  try {
    const userId = req.user.id;
    const { profileId } = req.body || {};
    if (!profileId) return res.status(400).json({ ok: false, error: 'profileId required' });

    // update in-memory
    const current = store.shortlists.get(userId) || new Set();
    if (current.has(profileId)) {
      current.delete(profileId);
    } else {
      current.add(profileId);
    }
    store.shortlists.set(userId, current);

    // persist
    try {
      const shortlisted = await db.toggleShortlistDb(db._db, userId, profileId);
      return res.json({ success: true, ok: true, shortlisted });
    } catch (e) {
      console.warn('db shortlist failed', e);
    }

    return res.json({ success: true, ok: true, shortlisted: Array.from(current) });
  } catch (err) {
    console.error('toggleShortlist', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

async function getShortlist(req, res) {
  try {
    const userId = req.user.id;
    // DB is the source of truth
    try {
      const shortlisted = await db.getShortlistDb(db._db, userId);
      return res.json({ ok: true, shortlisted });
    } catch (e) {
      console.warn('db get shortlist failed', e);
    }

    const current = store.shortlists.get(userId) || new Set();
    return res.json({ ok: true, shortlisted: Array.from(current) });
  } catch (err) {
    console.error('getShortlist', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// --- helpers -------------------------------------------------------------

function calculateAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const diff = Date.now() - birth.getTime();
  return Math.abs(new Date(diff).getUTCFullYear() - 1970);
}

// "5ft 6in" / "5 ft" / "5'6\"" -> total inches (or null when unparseable)
function heightToInches(value) {
  if (!value) return null;
  const raw = String(value).toLowerCase().replace(/[’']/g, 'ft').replace(/"/g, 'in');
  const ftMatch = raw.match(/(\d+(?:\.\d+)?)\s*ft/);
  const inMatch = raw.match(/(\d+(?:\.\d+)?)\s*in/);
  if (!ftMatch && !inMatch) {
    const plain = Number(raw.trim());
    return Number.isFinite(plain) && plain > 0 && plain < 100 ? plain : null;
  }
  const feet = ftMatch ? Number(ftMatch[1]) : 0;
  const inches = inMatch ? Number(inMatch[1]) : 0;
  return feet * 12 + inches;
}

function inchesToFeetLabel(totalInches) {
  if (!totalInches) return '';
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return `${feet}ft ${inches}in`;
}

function maskPhone(phone) {
  const digits = String(phone || '');
  if (!digits) return '';
  if (digits.length <= 4) return '••••••';
  return `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

// has an Accepted interest between viewer and target? (either direction)
function hasAcceptedInterest(viewerId, targetId) {
  return store.interestRequests.some(
    (r) => r.status === 'Accepted' && ((r.fromUserId === viewerId && r.toProfileId === targetId) || (r.fromUserId === targetId && r.toProfileId === viewerId))
  );
}

function buildSearchResult(targetUserId, user, profile, viewerId) {
  const personal = profile.personal || {};
  const education = profile.education || {};
  const privacy = getPrivacySettings(targetUserId);
  const accepted = hasAcceptedInterest(viewerId, targetUserId);

  // Privacy rules (scope PDF §12 + contract): photos AND contact details stay
  // masked until the admin approves the profile OR an interest between viewer
  // and target is Accepted. The target's own toggles can keep them hidden.
  const revealBase = (profile.status === 'Approved') || accepted;
  const photoHidden = !revealBase || privacy.hidePhoto;
  const phoneHidden = !revealBase || privacy.hidePhone;

  // photo reference resolved only when visible — never leaks a private URL
  let photoDocId = null;
  if (!photoHidden) {
    for (const doc of store.documents.values()) {
      if (doc.userId === targetUserId && doc.documentType === 'photograph') {
        photoDocId = doc.id;
        break;
      }
    }
  }

  const heightInches = heightToInches(personal.height);
  // PRD high-priority #1: real compatibility score vs the viewer's saved
  // partner preferences (age, religion/caste, education, location, manglik).
  const viewerProfile = store.profiles.get(viewerId);
  const { computeCompatibility } = require('../utils/compatibility');
  const compatibility = computeCompatibility(viewerProfile?.preferences || {}, {
    age: calculateAge(personal.dob),
    religion: personal.religion,
    caste: personal.caste,
    highestQualification: education.highestQualification,
    profession: education.profession,
    city: personal.city,
    state: personal.state,
    manglik: personal.manglikStatus,
  });
  return {
    id: targetUserId,
    name: personal.firstName ? `${personal.firstName} ${personal.lastName || ''}`.trim() : user?.identifier || targetUserId,
    gender: personal.gender || 'Any',
    age: calculateAge(personal.dob),
    city: personal.city || '',
    state: personal.state || '',
    religion: personal.religion || '',
    caste: personal.caste || '',
    height: personal.height || '',
    heightInches,
    manglik: personal.manglikStatus || '',
    education: education.highestQualification || '',
    profession: education.profession || '',
    matchScore: compatibility.score,
    matchReasons: compatibility.reasons.join(' · '),
    profileStatus: profile.status || 'Draft',
    profileCompletion: profile.profileCompletion || 0,
    verifiedBadge: profile.status === 'Approved',
    photoVisible: !photoHidden,
    photoDocId,
    phoneVisible: !phoneHidden,
    phone: phoneHidden ? maskPhone(personal.mobile) : personal.mobile || '',
    interestStatus: interestStatusBetween(viewerId, targetUserId),
  };
}

function interestStatusBetween(fromUserId, toProfileId) {
  const request = store.interestRequests.find((r) => r.fromUserId === fromUserId && r.toProfileId === toProfileId);
  return request ? request.status : null;
}

// GET /api/matches/search?minAge&maxAge&minHeightFt&maxHeightFt&religion&caste&education&location
async function searchProfiles(req, res) {
  try {
    const viewerId = req.user.id;
    const q = req.query || {};
    const minAge = Number(q.minAge) > 0 ? Number(q.minAge) : null;
    const maxAge = Number(q.maxAge) > 0 ? Number(q.maxAge) : null;
    const minHeightFt = Number(q.minHeightFt) > 0 ? Number(q.minHeightFt) : null;
    const maxHeightFt = Number(q.maxHeightFt) > 0 ? Number(q.maxHeightFt) : null;
    const religion = String(q.religion || '').trim().toLowerCase();
    const caste = String(q.caste || '').trim().toLowerCase();
    const education = String(q.education || '').trim().toLowerCase();
    const location = String(q.location || '').trim().toLowerCase();

    const results = [];
    for (const [userId, user] of store.users.entries()) {
      if (userId === viewerId || user.role === 'admin') continue;
      const profile = store.profiles.get(userId);
      if (!profile) continue;
      // privacy: only admin-approved profiles are discoverable in search
      if ((profile.status || 'Draft') !== 'Approved') continue;

      const personal = profile.personal || {};
      const edu = profile.education || {};
      const age = calculateAge(personal.dob);
      const heightInches = heightToInches(personal.height);

      if (minAge && !(age !== null && age >= minAge)) continue;
      if (maxAge && !(age !== null && age <= maxAge)) continue;
      if (minHeightFt && !(heightInches !== null && heightInches >= minHeightFt * 12)) continue;
      if (maxHeightFt && !(heightInches !== null && heightInches <= maxHeightFt * 12)) continue;
      if (religion && !String(personal.religion || '').toLowerCase().includes(religion)) continue;
      if (caste && !String(personal.caste || '').toLowerCase().includes(caste)) continue;
      if (education && !`${edu.highestQualification || ''} ${edu.profession || ''}`.toLowerCase().includes(education)) continue;
      if (location && !`${personal.city || ''} ${personal.state || ''}`.toLowerCase().includes(location)) continue;

      results.push(buildSearchResult(userId, user, profile, viewerId));
    }

    return res.json({ ok: true, count: results.length, profiles: results });
  } catch (err) {
    console.error('searchProfiles', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// POST /api/matches/interest { profileId } — Express Interest (status Pending until accepted/rejected)
async function expressInterest(req, res) {
  try {
    const userId = req.user.id;
    const { profileId, message } = req.body || {};
    if (!profileId) return res.status(400).json({ ok: false, error: 'profileId required' });
    if (profileId === userId) return res.status(400).json({ ok: false, error: 'Cannot express interest in your own profile' });

    const existing = store.interestRequests.find((r) => r.fromUserId === userId && r.toProfileId === profileId);
    if (existing) {
      return res.json({ success: true, ok: true, request: existing, status: existing.status, alreadySent: true });
    }

    const request = {
      id: require('uuid').v4(),
      fromUserId: userId,
      toProfileId: profileId,
      status: 'Pending',
      message: String(message || ''),
      createdAt: Date.now(),
      respondedAt: null,
    };
    store.interestRequests.unshift(request);

    // legacy set kept for compatibility + notification for the recipient
    const current = store.interests.get(userId) || new Set();
    current.add(profileId);
    store.interests.set(userId, current);
    try {
      const nid = require('uuid').v4();
      await db.addInterestDb(db._db, userId, profileId);
      await db.saveInterestRequest(db._db, request);
      await db.saveNotificationDb(db._db, {
        id: nid,
        toUserId: profileId,
        fromUserId: userId,
        type: 'interest_received',
        payload: JSON.stringify({ requestId: request.id }),
        at: Date.now(),
      });
      store.notifications.unshift({ id: nid, toUserId: profileId, fromUserId: userId, type: 'interest_received', payload: JSON.stringify({ requestId: request.id }), at: Date.now() });
    } catch (e) {
      console.warn('db add interest failed', e);
    }

    applyUsage(userId, { profilesShared: 1 });
    return res.status(201).json({ success: true, ok: true, request, status: request.status });
  } catch (err) {
    console.error('expressInterest', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// GET /api/matches/interests — sent + received interest requests with statuses
async function listInterests(req, res) {
  try {
    const userId = req.user.id;
    const nameOf = (id) => {
      const u = store.users.get(id);
      const p = store.profiles.get(id);
      const personal = p?.personal || {};
      const label = personal.firstName ? `${personal.firstName} ${personal.lastName || ''}`.trim() : u?.identifier || id;
      return label;
    };

    const sent = store.interestRequests.filter((r) => r.fromUserId === userId).map((r) => ({ ...r, name: nameOf(r.toProfileId), direction: 'sent' }));
    const received = store.interestRequests.filter((r) => r.toProfileId === userId).map((r) => ({ ...r, name: nameOf(r.fromUserId), direction: 'received' }));
    return res.json({ ok: true, sent, received });
  } catch (err) {
    console.error('listInterests', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// POST /api/matches/interest/respond { requestId, action: 'Accepted' | 'Rejected' }
async function respondToInterest(req, res) {
  try {
    const userId = req.user.id;
    const { requestId, action } = req.body || {};
    const normalized = String(action || '').trim().toLowerCase();
    const status = normalized === 'accept' || normalized === 'accepted' ? 'Accepted' : normalized === 'reject' || normalized === 'rejected' ? 'Rejected' : null;
    if (!requestId || !status) return res.status(400).json({ ok: false, error: 'requestId and action (Accepted | Rejected) required' });

    const request = store.interestRequests.find((r) => r.id === requestId);
    if (!request) return res.status(404).json({ ok: false, error: 'Interest request not found' });
    if (request.toProfileId !== userId) return res.status(403).json({ ok: false, error: 'Only the recipient can respond' });
    if (request.status !== 'Pending') return res.status(409).json({ ok: false, error: `Interest already ${request.status.toLowerCase()}` });

    request.status = status;
    request.respondedAt = Date.now();

    try {
      const nid = require('uuid').v4();
      const notification = { id: nid, toUserId: request.fromUserId, fromUserId: userId, type: `interest_${status.toLowerCase()}`, payload: '{}', at: Date.now() };
      await db.updateInterestRequestDb(db._db, request.id, { status: request.status, respondedAt: request.respondedAt });
      await db.saveNotificationDb(db._db, notification);
      store.notifications.unshift(notification);
    } catch (e) {
      console.warn('db respond interest failed', e);
    }

    return res.json({ success: true, ok: true, request });
  } catch (err) {
    console.error('respondToInterest', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = { toggleShortlist, getShortlist, expressInterest, listInterests, respondToInterest, searchProfiles, heightToInches, inchesToFeetLabel };
