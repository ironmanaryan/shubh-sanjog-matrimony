// Simple in-memory store for demo purposes. Replace with a real DB in production.
const { v4: uuidv4 } = require('uuid');
const { matchesAdminIdentifier } = require('../middleware/rbac');

const store = {
  users: new Map(), // userId -> user object
  otps: new Map(), // identifier -> { code, expiresAt }
  profiles: new Map(), // userId -> profile object
  documents: new Map(), // fileId -> metadata { id, userId, originalName, path, mimetype }
  memberships: new Map(), // userId -> membership data
  payments: new Map(), // paymentId -> payment record (UPI verification queue)
  interestRequests: [], // [{ id, fromUserId, toProfileId, status, createdAt, respondedAt }]
  shortlists: new Map(), // userId -> Set(profileId)
  interests: new Map(), // userId -> Set(profileId)
  notifications: [],
  appointments: new Map(), // appointmentId -> booking { ... }
  matchAssignments: new Map(), // customerUserId -> [{ candidateId, assignedAt, note }]
};

// Contract plan catalog (scope PDF §9). SEED SOURCE ONLY — the runtime single
// source of truth is the `membership_plans` table in SQLite (see db.js).
const { MEMBERSHIP_PACKAGES, UPI_CONFIG } = require('./plan-catalog');

function getPlan(tier) {
  const key = String(tier || '').trim();
  const normalized = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
  return MEMBERSHIP_PACKAGES[normalized] || null;
}

// Consultation is a paid session, not a full matchmaking membership
function isMembershipTier(tier) {
  return tier === 'Gold' || tier === 'Premium';
}

// Return the customer's persisted membership, or null when they never purchased one.
// No fabricated defaults: statuses come strictly from the DB-backed store.
function ensureMembership(userId) {
  const current = store.memberships.get(userId);
  if (!current) return null;
  if (current.expiresAt && Number(current.expiresAt) < Date.now()) {
    current.active = false;
    store.memberships.set(userId, current);
  }
  return current;
}

function applyUsage(userId, { meetings = 0, profilesShared = 0 } = {}) {
  const membership = store.memberships.get(userId);
  if (!membership) return null;
  if (meetings > 0) {
    membership.usedMeetings = (membership.usedMeetings || 0) + meetings;
    membership.meetingsLeft = Math.max(0, (membership.meetingsLeft || 0) - meetings);
  }
  if (profilesShared > 0) {
    membership.sharedProfilesCount = (membership.sharedProfilesCount || 0) + profilesShared;
  }
  store.memberships.set(userId, membership);
  return membership;
}

// Replace the user's membership with a purchased plan (called after payment approval)
function activateMembership(userId, plan, { startedAt = Date.now() } = {}) {
  if (!plan) return null;
  const durationDays = Number(plan.durationDays || 30);
  const membership = {
    ...plan,
    tier: plan.tier,
    active: true,
    usedMeetings: 0,
    sharedProfilesCount: 0,
    meetingsLeft: plan.meetingsAllowed || 0,
    profilesAllowed: plan.profilesMax || plan.profilesAllowed || 0,
    profilesMin: plan.profilesMin || 0,
    startedAt,
    expiresAt: startedAt + durationDays * 24 * 60 * 60 * 1000,
  };
  store.memberships.set(userId, membership);
  return membership;
}

function getPrivacySettings(userId) {
  const profile = store.profiles.get(userId) || {};
  const privacy = profile.privacy || {};
  return {
    hidePhoto: privacy.hidePhoto === true,
    hidePhone: privacy.hidePhone === true,
  };
}

function setPrivacySettings(userId, { hidePhoto, hidePhone }) {
  const current = store.profiles.get(userId) || {};
  current.privacy = {
    ...(current.privacy || {}),
    hidePhoto: hidePhoto === true,
    hidePhone: hidePhone === true,
  };
  store.profiles.set(userId, current);
  return current.privacy;
}

function normalizeEmail(email) {
  // Email is strictly optional: empty/undefined/whitespace collapses to null so
  // we never persist '' (which would collide in unique indexes / lookups).
  const value = String(email || '').trim().toLowerCase();
  return value || null;
}

// identifier is the phone number (primary) or an email for legacy accounts.
// `details` carries the strictly-optional extras collected at registration.
function createUserIfMissing(identifier, details = {}) {
  const key = String(identifier || '').trim();
  if (!key) return null;

  const existing = Array.from(store.users.values()).find(
    (user) => String(user.identifier).toLowerCase() === key.toLowerCase()
  );
  if (existing) {
    // Backfill optional details if they arrive on a later sign-in.
    if (!existing.email && details.email) existing.email = normalizeEmail(details.email);
    if (!existing.fullName && details.fullName) existing.fullName = String(details.fullName).trim();
    return existing;
  }

  const role = matchesAdminIdentifier(key) ? 'admin' : 'customer';
  const user = {
    id: uuidv4(),
    identifier: key,
    email: normalizeEmail(details.email), // null when not provided
    fullName: details.fullName ? String(details.fullName).trim() : undefined,
    role,
    createdAt: Date.now(),
  };
  store.users.set(user.id, user);
  return user;
}

module.exports = { store, createUserIfMissing, normalizeEmail, ensureMembership, applyUsage, activateMembership, getPlan, isMembershipTier, getPrivacySettings, setPrivacySettings, MEMBERSHIP_PACKAGES, UPI_CONFIG };
