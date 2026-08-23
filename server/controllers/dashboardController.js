const { store } = require('../data/store');

function calculateProfileCompletion(profile) {
  if (!profile) return 0;

  // list of important fields by section taken from the scope PDF §5-§6
  const required = {
    personal: ['firstName','lastName','gender','dob','height','weight','religion','caste','subCaste','motherTongue','maritalStatus','city','state','country','citizenship','nriStatus','manglikStatus'],
    education: ['highestQualification','educationDetails','profession','jobType','company','annualIncome','workLocation','experience'],
    family: ['fatherName','fatherOccupation','motherName','motherOccupation','numberOfBrothers','numberOfSisters','familyType','familyStatus','familyLocation'],
    preferences: ['preferredGender','minAge','maxAge','heightRange','religion','caste','motherTongue','maritalStatus','education','profession','incomeRange','location','nriPreference','manglikPreference']
  };

  let total = 0;
  let present = 0;

  for (const section of Object.keys(required)) {
    const fields = required[section];
    total += fields.length;
    const sectObj = profile[section] || {};
    for (const f of fields) {
      const v = sectObj[f] ?? sectObj[f.charAt(0).toLowerCase() + f.slice(1)] ?? sectObj[f.toLowerCase()];
      if (v !== undefined && v !== null && String(v).trim() !== '') present += 1;
    }
  }

  // Lifestyle (scope PDF §5) lives in the personal section
  const lifestyleFields = ['foodPreference', 'smoking', 'drinking', 'hobbies', 'interests', 'about'];
  const personalObj = profile.personal || {};
  total += lifestyleFields.length;
  for (const f of lifestyleFields) {
    const v = personalObj[f];
    if (v !== undefined && v !== null && String(v).trim() !== '') present += 1;
  }

  const score = total > 0 ? Math.round((present / total) * 100) : 0;
  if (profile && typeof profile === 'object') profile.profileCompletion = score;
  return score;
}

async function getStats(req, res) {
  try {
    const userId = req.user.id;
    const profile = store.profiles.get(userId) || {};
    const completion = calculateProfileCompletion(profile);

    // PDF §10 - membership usage tracking; strictly reflects the purchased plan
    const { ensureMembership } = require('../data/store');
    const membership = ensureMembership(userId); // null when nothing was purchased/approved
    let membershipSummary;
    if (membership) {
      membershipSummary = {
        tier: membership.tier,
        active: membership.active !== false && (!membership.expiresAt || Number(membership.expiresAt) > Date.now()),
        startedAt: membership.startedAt || null,
        expiresAt: membership.expiresAt || null,
        meetingsAllowed: Number(membership.meetingsAllowed || 0),
        meetingsUsed: Number(membership.usedMeetings || 0),
        meetingsLeft: Number(membership.meetingsLeft || 0),
        profilesAllowed: Number(membership.profilesAllowed || 0),
        profilesShared: Number(membership.sharedProfilesCount || 0),
        profilesRemaining: Math.max(0, Number(membership.profilesAllowed || 0) - Number(membership.sharedProfilesCount || 0)),
      };
    } else {
      membershipSummary = {
        tier: null,
        active: false,
        startedAt: null,
        expiresAt: null,
        meetingsAllowed: 0,
        meetingsUsed: 0,
        meetingsLeft: 0,
        profilesAllowed: 0,
        profilesShared: 0,
        profilesRemaining: 0,
      };
    }

    const meetingsLeft = membershipSummary.meetingsLeft;
    const matchesRemaining = membershipSummary.profilesRemaining;

    // recommended candidates: admin-approved profiles only, excluding self
    const recommended = [];
    for (const [id, p] of store.profiles.entries()) {
      if (id === userId) continue;
      if ((p.status || 'Draft') !== 'Approved') continue;
      recommended.push({ id, personal: p.personal || {}, education: p.education || {} });
      if (recommended.length >= 6) break;
    }

    return res.json({ ok: true, stats: { profileCompletion: completion, profileStatus: profile.status || 'Draft', membership: membershipSummary, meetingsLeft, matchesRemaining, profilesShared: membershipSummary.profilesShared, recommendedProfiles: recommended } });
  } catch (err) {
    console.error('getStats', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = { getStats, calculateProfileCompletion };
