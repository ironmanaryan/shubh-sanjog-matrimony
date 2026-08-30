// MongoDB persistence driver (Mongoose) — LEGACY / DEPRECATED
// This driver is retained only for transition fallback. The primary store is now
// Supabase PostgreSQL (server/db-supabase.js). Mongoose is no longer a
// dependency (removed from package.json); this file gracefully no-ops when
// mongoose is not installed so `require('./db-mongo')` never crashes boot.
let mongoose = null;
try {
  mongoose = require('mongoose');
} catch {
  console.warn('[db-mongo] mongoose not installed — legacy MongoDB driver disabled (using Supabase/SQLite).');
  module.exports = {
    init: async () => { throw new Error('Mongoose not installed — MongoDB disabled'); },
    hydrateStore: async () => {},
    isMongo: false,
  };
  // early return: keep file loadable without mongoose
  return;
}
const crypto = require('crypto');

const { Schema } = mongoose;

function uuid() {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const UserIdField = { type: String, index: true };

const UserSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    identifier: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, default: null },
    fullName: { type: String, default: null },
    role: { type: String, enum: ['admin', 'relationship_manager', 'staff', 'customer'], default: 'customer', index: true },
    createdAt: { type: Number, default: () => Date.now() },
    deletedAt: { type: Number, default: null },
    tokenRevokedAt: { type: Number, default: null },
  },
  { versionKey: false }
);

const Sub = (def) => new Schema(def, { _id: false });

const PersonalSchema = Sub({
  firstName: String, lastName: String, gender: String, dob: String, height: String, weight: String,
  religion: String, caste: String, subCaste: String, motherTongue: String, maritalStatus: String,
  manglikStatus: String, city: String, state: String, country: String, citizenship: String,
  nriStatus: String, mobile: String, email: String,
  foodPreference: String, smoking: String, drinking: String, hobbies: String, interests: String, about: String,
});

const EducationSchema = Sub({
  highestQualification: String, educationDetails: String, profession: String, jobType: String,
  company: String, annualIncome: String, workLocation: String, experience: String,
});

const FamilySchema = Sub({
  fatherName: String, fatherOccupation: String, motherName: String, motherOccupation: String,
  numberOfBrothers: Schema.Types.Mixed, numberOfSisters: Schema.Types.Mixed,
  familyType: String, familyStatus: String, familyLocation: String, otherInfo: String,
});

const PreferencesSchema = Sub({
  preferredGender: String, minAge: Schema.Types.Mixed, maxAge: Schema.Types.Mixed, heightRange: String,
  religion: String, caste: String, motherTongue: String, maritalStatus: String, education: String,
  profession: String, incomeRange: String, location: String, nriPreference: String,
  manglikPreference: String, partnerExpectationsText: String, aboutPartner: String,
});

const PrivacySchema = Sub({ hidePhoto: Boolean, hidePhone: Boolean });

const MatrimonialProfileSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true },
    personal: { type: PersonalSchema, default: () => ({}) },
    education: { type: EducationSchema, default: () => ({}) },
    family: { type: FamilySchema, default: () => ({}) },
    preferences: { type: PreferencesSchema, default: () => ({}) },
    privacy: { type: PrivacySchema, default: () => ({}) },
    status: { type: String, enum: ['Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected'], default: 'Draft', index: true },
    reviewNote: { type: String, default: null },
    profileCompletion: { type: Number, default: 0 },
    submittedAt: { type: Number, default: null },
    reviewedAt: { type: Number, default: null },
    updatedAt: { type: Number, default: () => Date.now() },
  },
  { versionKey: false }
);
MatrimonialProfileSchema.index({ status: 1, submittedAt: -1 });

const DocumentSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    userId: { ...UserIdField, required: true },
    originalName: String,
    storedName: String,
    path: String,
    mimetype: String,
    size: Number,
    documentType: { type: String, default: 'identity' }, // identity | address | education | income | photograph | kundli(horoscope) | other
    status: { type: String, default: 'Pending' },
    rejectionReason: { type: String, default: null },
    uploadedAt: { type: Number, default: () => Date.now() },
    reviewedAt: { type: Number, default: null },
  },
  { versionKey: false }
);

const AppointmentSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    userId: { ...UserIdField, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    type: { type: String, default: 'Consultation' },
    notes: { type: String, default: '' },
    status: { type: String, default: 'Booked' }, // Booked | Completed | Cancelled
    feedback: { type: String, default: null },
    completedAt: { type: Number, default: null },
    createdAt: { type: Number, default: () => Date.now() },
  },
  { versionKey: false }
);
AppointmentSchema.index({ date: 1, time: 1 });

const PaymentSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    userId: { ...UserIdField, required: true },
    plan: { type: String, required: true },
    amount: { type: Number, default: 0 },
    // manual UPI verification flow (no third-party gateway)
    upiId: { type: String, default: null },
    utr: { type: String, default: null },
    receiptPath: { type: String, default: null },
    receiptName: { type: String, default: null },
    receiptMimetype: { type: String, default: null },
    receiptSize: { type: Number, default: null },
    gateway: { type: String, default: 'manual_upi' },
    status: { type: String, default: 'Pending Verification', index: true }, // Pending Verification | Approved | Rejected
    rejectionReason: { type: String, default: null },
    createdAt: { type: Number, default: () => Date.now(), index: true },
    reviewedAt: { type: Number, default: null },
  },
  { versionKey: false }
);

const AuditLogSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    adminId: { type: String, default: null },
    action: { type: String, required: true },
    targetUserId: { type: String, default: null },
    detail: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    createdAt: { type: Number, default: () => Date.now() },
  },
  { versionKey: false }
);
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ targetUserId: 1, createdAt: -1 });

// OTPs live in Mongo with a TTL index on expiresAt — the server sweeps expired
// codes automatically (~60s cadence). Raw codes are never stored, only a hash.
const OtpSchema = new Schema(
  {
    identifier: { type: String, required: true, lowercase: true, trim: true },
    codeHash: { type: String, required: true },
    purpose: { type: String, default: 'login' },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Number, default: null },
    createdAt: { type: Number, default: () => Date.now() },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false }
);
OtpSchema.index({ identifier: 1, createdAt: -1 });
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const MembershipPlanSchema = new Schema(
  {
    tier: { type: String, required: true, unique: true },
    name: String,
    price: { type: Number, required: true },
    durationDays: { type: Number, required: true },
    meetingsAllowed: { type: Number, required: true },
    profilesMin: { type: Number, default: 0 },
    profilesMax: { type: Number, default: 0 },
    priorityAssistance: { type: Boolean, default: false },
    description: { type: String, default: '' },
    features: { type: [String], default: [] },
    popular: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { versionKey: false }
);

const MembershipSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true },
    tier: { type: String, default: null },
    price: { type: Number, default: null },
    active: { type: Boolean, default: false },
    durationDays: { type: Number, default: null },
    meetingsAllowed: { type: Number, default: 0 },
    usedMeetings: { type: Number, default: 0 },
    meetingsLeft: { type: Number, default: null },
    profilesAllowed: { type: Number, default: 0 },
    sharedProfilesCount: { type: Number, default: 0 },
    startedAt: { type: Number, default: null },
    expiresAt: { type: Number, default: null },
    activatedByPaymentId: { type: String, default: null },
    updatedAt: { type: Number, default: () => Date.now() },
  },
  { versionKey: false }
);

const MatchAssignmentSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    customerId: { type: String, required: true, index: true },
    candidateId: { type: String, required: true },
    note: { type: String, default: '' },
    assignedBy: { type: String, default: null },
    assignedAt: { type: Number, default: () => Date.now() },
  },
  { versionKey: false }
);

const InterestRequestSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    fromUserId: { type: String, required: true, index: true },
    toProfileId: { type: String, required: true, index: true },
    status: { type: String, default: 'Pending' },
    message: { type: String, default: '' },
    createdAt: { type: Number, default: () => Date.now() },
    respondedAt: { type: Number, default: null },
  },
  { versionKey: false }
);

const ShortlistSchema = new Schema(
  { userId: { ...UserIdField, required: true }, profileId: String, createdAt: { type: Number, default: () => Date.now() } },
  { versionKey: false }
);
ShortlistSchema.index({ userId: 1, profileId: 1 }, { unique: true });

const InterestSchema = new Schema(
  { userId: { ...UserIdField, required: true }, profileId: String, createdAt: { type: Number, default: () => Date.now() } },
  { versionKey: false }
);
InterestSchema.index({ userId: 1, profileId: 1 }, { unique: true });

const NotificationSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    toUserId: { ...UserIdField },
    fromUserId: { type: String, default: null },
    type: String,
    payload: { type: String, default: '' },
    readAt: { type: Number, default: null },
    at: { type: Number, default: () => Date.now() },
  },
  { versionKey: false }
);

const InternalNoteSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    targetType: String,
    targetId: { type: String, index: true },
    authorId: { type: String, default: null },
    note: { type: String, default: '' },
    createdAt: { type: Number, default: () => Date.now() },
  },
  { versionKey: false }
);

const InquirySchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, default: null },
    mobile: { type: String, default: null },
    email: { type: String, default: null },
    subject: { type: String, default: 'General enquiry' },
    message: { type: String, default: '' },
    status: { type: String, default: 'New' },
    adminNote: { type: String, default: null },
    createdAt: { type: Number, default: () => Date.now() },
    updatedAt: { type: Number, default: () => Date.now() },
  },
  { versionKey: false }
);

const RevocationSchema = new Schema(
  { userId: { type: String, required: true, unique: true }, revokedAt: Number },
  { versionKey: false }
);

let User, MatrimonialProfile, DocumentModel, AppointmentModel, PaymentModel, AuditLog, Otp, MembershipPlan, MembershipModel, MatchAssignment, InterestRequest, ShortlistModel, InterestModel, NotificationModel, InternalNote, InquiryModel, Revocation;

function buildModels() {
  const m = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);
  User = m('User', UserSchema);
  MatrimonialProfile = m('MatrimonialProfile', MatrimonialProfileSchema);
  DocumentModel = m('Document', DocumentSchema);
  AppointmentModel = m('Appointment', AppointmentSchema);
  PaymentModel = m('Payment', PaymentSchema);
  AuditLog = m('AuditLog', AuditLogSchema);
  Otp = m('Otp', OtpSchema);
  MembershipPlan = m('MembershipPlan', MembershipPlanSchema);
  MembershipModel = m('Membership', MembershipSchema);
  MatchAssignment = m('MatchAssignment', MatchAssignmentSchema);
  InterestRequest = m('InterestRequest', InterestRequestSchema);
  ShortlistModel = m('Shortlist', ShortlistSchema);
  InterestModel = m('Interest', InterestSchema);
  NotificationModel = m('Notification', NotificationSchema);
  InternalNote = m('InternalNote', InternalNoteSchema);
  InquiryModel = m('Inquiry', InquirySchema);
  Revocation = m('Revocation', RevocationSchema);
}

const DEFAULT_PLANS = [
  { tier: 'Consultation', name: 'Consultation Session', price: 599, durationDays: 30, meetingsAllowed: 1, profilesMin: 0, profilesMax: 0, sortOrder: 1, description: 'One paid consultation session with our matchmaking advisor.', features: ['1 consultation meeting', 'Profile review guidance'] },
  { tier: 'Gold', name: 'Gold Membership', price: 5100, durationDays: 90, meetingsAllowed: 5, profilesMin: 15, profilesMax: 25, popular: true, sortOrder: 2, description: 'Curated matchmaking with dedicated relationship support.', features: ['Up to 25 recommended profiles', '5 meetings', 'Priority assistance'] },
  { tier: 'Premium', name: 'Premium Membership', price: 11000, durationDays: 180, meetingsAllowed: 12, profilesMin: 40, profilesMax: 60, sortOrder: 3, description: 'Concierge-level matchmaking with the widest reach.', features: ['Up to 60 recommended profiles', '12 meetings', 'Dedicated relationship manager', 'Horoscope matching'] },
];

async function init() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not configured');
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || undefined });
  buildModels();

  // Seed canonical pricing tiers once (idempotent): Consultation ₹599 / Gold ₹5,100 / Premium ₹11,000
  for (const plan of DEFAULT_PLANS) {
    await MembershipPlan.updateOne({ tier: plan.tier }, { $setOnInsert: plan }, { upsert: true });
  }

  // Bootstrap designated admins (PRD §4): ADMIN_EMAILS / ADMIN_IDENTIFIERS are
  // forced to role 'admin' on initialization so they can sign in immediately.
  // aryansadanshiv8@gmail.com is the owner account and is always granted ADMIN.
  const adminIdentifiers = [
    'aryansadanshiv8@gmail.com',
    ...String(process.env.ADMIN_EMAILS || 'admin@shubhsanjog.com').split(','),
    ...String(process.env.ADMIN_IDENTIFIERS || '').split(','),
  ]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  for (const identifier of [...new Set(adminIdentifiers)]) {
    await User.updateOne(
      { identifier },
      { $set: { role: 'admin' }, $setOnInsert: { id: uuid(), identifier, createdAt: Date.now() } },
      { upsert: true }
    );
  }

  return mongoose.connection;
}

function plain(doc) {
  if (!doc) return null;
  return typeof doc.toObject === 'function' ? doc.toObject({ versionKey: false, deps: false }) : doc;
}

function userPlain(doc) {
  if (!doc) return null;
  const o = plain(doc);
  return o && { id: o.id, identifier: o.identifier, email: o.email ?? null, fullName: o.fullName ?? null, role: o.role || 'customer', createdAt: o.createdAt, deletedAt: o.deletedAt ?? null };
}

function profilePlain(doc) {
  if (!doc) return null;
  const o = plain(doc) || {};
  return {
    userId: o.userId,
    personal: o.personal || {},
    education: o.education || {},
    family: o.family || {},
    preferences: o.preferences || {},
    privacy: o.privacy || {},
    profileCompletion: o.profileCompletion || 0,
    status: o.status || 'Draft',
    reviewNote: o.reviewNote ?? null,
    submittedAt: o.submittedAt ?? null,
    reviewedAt: o.reviewedAt ?? null,
    updatedAt: o.updatedAt,
  };
}

function paymentPlain(doc) {
  if (!doc) return null;
  const o = plain(doc) || {};
  return { ...o, id: o.id, price: undefined };
}

// --- hydration ----------------------------------------------------------------
async function hydrateStore() {
  const { store } = require('./data/store');
  const [users, profiles, documents, shortlists, interests, notifications, payments, interestRequests, memberships, auditRows, appointments, matchAssignments] =
    await Promise.all([
      User.find({}).lean(),
      MatrimonialProfile.find({}).lean(),
      DocumentModel.find({}).lean(),
      ShortlistModel.find({}).lean(),
      InterestModel.find({}).lean(),
      NotificationModel.find({}).sort({ at: -1 }).lean(),
      PaymentModel.find({}).sort({ createdAt: -1 }).lean(),
      InterestRequest.find({}).sort({ createdAt: -1 }).lean(),
      MembershipModel.find({}).lean(),
      AuditLog.find({}).sort({ createdAt: -1 }).limit(5000).lean(),
      AppointmentModel.find({}).lean(),
      MatchAssignment.find({}).sort({ assignedAt: -1 }).lean(),
    ]);

  store.users.clear();
  store.profiles.clear();
  store.documents.clear();
  store.shortlists.clear();
  store.interests.clear();
  store.payments.clear();
  store.notifications = [];
  store.interestRequests = [];
  store.memberships.clear();
  store.auditLogs = [];
  store.tokenRevocations.clear();
  store.appointments.clear();
  store.matchAssignments.clear();

  for (const u of users) store.users.set(u.id, userPlain(u));
  for (const p of profiles) store.profiles.set(p.userId, profilePlain(p));
  for (const d of documents) store.documents.set(d.id, d);
  for (const row of shortlists) {
    const cur = store.shortlists.get(row.userId) || new Set();
    cur.add(row.profileId);
    store.shortlists.set(row.userId, cur);
  }
  for (const row of interests) {
    const cur = store.interests.get(row.userId) || new Set();
    cur.add(row.profileId);
    store.interests.set(row.userId, cur);
  }
  for (const p of payments) store.payments.set(p.id, p);
  store.notifications = notifications.map((n) => ({ id: n.id, toUserId: n.toUserId, fromUserId: n.fromUserId, type: n.type, payload: n.payload || '', at: n.at }));
  store.interestRequests = interestRequests.map((r) => ({ id: r.id, fromUserId: r.fromUserId, toProfileId: r.toProfileId, status: r.status || 'Pending', message: r.message || '', createdAt: r.createdAt, respondedAt: r.respondedAt ?? null }));
  for (const m of memberships) {
    store.memberships.set(m.userId, {
      tier: m.tier, price: m.price ?? null, active: m.active === true, durationDays: m.durationDays ?? null,
      meetingsAllowed: m.meetingsAllowed ?? 0, usedMeetings: m.usedMeetings || 0, meetingsLeft: m.meetingsLeft ?? null,
      profilesAllowed: m.profilesAllowed ?? 0, sharedProfilesCount: m.sharedProfilesCount || 0,
      startedAt: m.startedAt ?? null, expiresAt: m.expiresAt ?? null, activatedByPaymentId: m.activatedByPaymentId ?? null,
    });
  }
  store.auditLogs = auditRows.slice().reverse();
  for (const a of appointments) {
    store.appointments.set(a.id, { ...a, id: a.id });
  }
  for (const row of matchAssignments) {
    const list = store.matchAssignments.get(row.customerId) || [];
    list.push({ id: row.id, customerId: row.customerId, candidateId: row.candidateId, note: row.note || '', assignedBy: row.assignedBy ?? null, assignedAt: row.assignedAt });
    store.matchAssignments.set(row.customerId, list);
  }
  const revocations = await Revocation.find({}).lean();
  for (const r of revocations) store.tokenRevocations.set(r.userId, Number(r.revokedAt || 0));
  return store;
}

// --- users ---------------------------------------------------------------------
async function createUser(dbIgnored, user) {
  await User.updateOne(
    { identifier: user.identifier },
    { $setOnInsert: { id: user.id || uuid(), identifier: user.identifier, email: user.email ?? null, fullName: user.fullName ?? null, role: user.role || 'customer', createdAt: user.createdAt || Date.now() } },
    { upsert: true }
  );
}

async function getUserByIdentifier(dbIgnored, identifier) {
  return userPlain(await User.findOne({ identifier }));
}

async function getUserById(dbIgnored, id) {
  return userPlain(await User.findOne({ id }));
}

async function setUserRole(dbIgnored, userId, role) {
  await User.updateOne({ id: userId }, { $set: { role } });
  return getUserById(dbIgnored, userId);
}

// Best-effort backfill of the optional email on repeat sign-ins (never
// overwrites an existing non-null value).
async function backfillUserEmail(dbIgnored, userId, email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!userId || !normalized) return;
  await User.updateOne({ id: userId, email: null }, { $set: { email: normalized } });
}

async function listUsers(dbIgnored) {
  const rows = await User.find({}).sort({ createdAt: -1 }).lean();
  return rows.map(userPlain);
}

// --- matrimonial profile ---------------------------------------------------------
async function upsertProfile(dbIgnored, userId, profile) {
  const now = Date.now();
  await MatrimonialProfile.updateOne(
    { userId },
    {
      $set: {
        personal: profile.personal || {},
        education: profile.education || {},
        family: profile.family || {},
        preferences: profile.preferences || {},
        privacy: profile.privacy || {},
        profileCompletion: Number(profile.profileCompletion || 0),
        ...(profile.status ? { status: profile.status } : {}),
        ...(profile.reviewNote !== undefined ? { reviewNote: profile.reviewNote } : {}),
        ...(profile.submittedAt !== undefined ? { submittedAt: profile.submittedAt } : {}),
        ...(profile.reviewedAt !== undefined ? { reviewedAt: profile.reviewedAt } : {}),
        updatedAt: now,
      },
    },
    { upsert: true }
  );
}

function mapProfileRow(row) {
  // parity with the SQLite driver: accepts either a Mongo lean doc or an
  // already-mapped profile object.
  if (!row) return null;
  if (row.userId && row.personal && !row._id) return row;
  return profilePlain(row);
}

async function getProfile(dbIgnored, userId) {
  return profilePlain(await MatrimonialProfile.findOne({ userId }).lean());
}

async function setProfileReview(dbIgnored, userId, { status, reviewNote = null }) {
  await MatrimonialProfile.updateOne({ userId }, { $set: { status, reviewNote, reviewedAt: Date.now() } });
}

async function submitProfileForReviewDb(dbIgnored, userId, completion) {
  await MatrimonialProfile.updateOne({ userId }, { $set: { status: 'Submitted', reviewNote: null, submittedAt: Date.now(), profileCompletion: Number(completion || 0) } });
}

async function listProfilesByStatusDb(dbIgnored, statuses) {
  const rows = await MatrimonialProfile.find({ status: { $in: statuses } }).sort({ submittedAt: -1 }).lean();
  const out = [];
  for (const row of rows) {
    const mapped = profilePlain(row);
    const user = await getUserById(dbIgnored, mapped.userId);
    mapped.customerIdentifier = user?.identifier || null;
    out.push(mapped);
  }
  return out;
}

// --- membership plans -------------------------------------------------------------
function mapPlan(doc) {
  return {
    tier: doc.tier,
    name: doc.name,
    price: Number(doc.price),
    durationDays: Number(doc.durationDays),
    meetingsAllowed: Number(doc.meetingsAllowed),
    profilesMin: Number(doc.profilesMin || 0),
    profilesMax: Number(doc.profilesMax || 0),
    priorityAssistance: Boolean(doc.priorityAssistance),
    description: doc.description || '',
    features: Array.isArray(doc.features) ? doc.features : [],
    popular: Boolean(doc.popular),
  };
}

async function listMembershipPlansDb() {
  const rows = await MembershipPlan.find({ active: true }).sort({ sortOrder: 1 }).lean();
  return rows.map(mapPlan);
}

async function getPlanDb(dbIgnored, tier) {
  const row = await MembershipPlan.findOne({ tier: new RegExp(`^${String(tier || '').trim()}$`, 'i'), active: true }).lean();
  return row ? mapPlan(row) : null;
}

// --- match assignments --------------------------------------------------------------
async function saveMatchAssignmentDb(dbIgnored, assignment) {
  await MatchAssignment.updateOne({ id: assignment.id }, { $setOnInsert: assignment }, { upsert: true });
}

async function listMatchAssignmentsDb(dbIgnored, customerId = null) {
  const filter = customerId ? { customerId } : {};
  const rows = await MatchAssignment.find(filter).sort({ assignedAt: -1 }).lean();
  return rows.map((r) => ({ ...plain(r), id: r.id }));
}

// --- privacy --------------------------------------------------------------------------
async function upsertPrivacyOnly(dbIgnored, userId, privacy) {
  await MatrimonialProfile.updateOne({ userId }, { $set: { privacy: privacy || {}, updatedAt: Date.now() } }, { upsert: true });
}
async function savePrivacyDb(dbIgnored, userId, privacy) {
  return upsertPrivacyOnly(dbIgnored, userId, privacy);
}

// --- payments ----------------------------------------------------------------------------
async function savePayment(dbIgnored, payment) {
  const { id, ...rest } = payment;
  await PaymentModel.updateOne({ id }, { $set: rest }, { upsert: true });
}

async function setPaymentStatus(dbIgnored, id, status, rejectionReason = null) {
  await PaymentModel.updateOne({ id }, { $set: { status, rejectionReason, reviewedAt: Date.now() } });
}

async function getPaymentById(dbIgnored, id) {
  const row = await PaymentModel.findOne({ id }).lean();
  return row ? { ...row, id: row.id } : null;
}

// Look up a payment by its Razorpay order id — used by the checkout verify
// handshake AND the server-to-server webhook to flip membership state.
async function getPaymentByOrderId(dbIgnored, orderId) {
  const row = await PaymentModel.findOne({ razorpayOrderId: orderId }).lean();
  return row ? { ...row, id: row.id } : null;
}

async function listPayments(dbIgnored) {
  const rows = await PaymentModel.find({}).sort({ createdAt: -1 }).lean();
  return rows.map((r) => ({ ...r, id: r.id }));
}

async function listPaymentsByUserDb(dbIgnored, userId) {
  const rows = await PaymentModel.find({ userId }).sort({ createdAt: -1 }).lean();
  return rows.map((r) => ({ ...r, id: r.id }));
}

// --- interest requests ----------------------------------------------------------------------
async function saveInterestRequest(dbIgnored, request) {
  await InterestRequest.updateOne({ id: request.id }, { $setOnInsert: request }, { upsert: true });
}

async function updateInterestRequestDb(dbIgnored, requestId, patch = {}) {
  await InterestRequest.updateOne({ id: requestId }, { $set: patch });
}

// Best-effort email backfill on repeat sign-ins (optional field).
async function backfillUserEmail(dbIgnored, userId, email) {
  if (!email) return;
  await User.updateOne({ id: userId }, { $set: { email } });
}

async function listPaymentsByUserDb(dbIgnored, userId) {
  const rows = await PaymentModel.find({ userId }).sort({ createdAt: -1 }).lean();
  return rows.map((r) => ({ ...r, id: r.id }));
}

async function getInquiryByIdDb(dbIgnored, id) {
  const row = await InquiryModel.findOne({ id }).lean();
  return row ? mapInquiryRow({ ...row, id: row.id }) : null;
}

// Persist status transitions (Accepted / Rejected) on an EXISTING request.
// $setOnInsert in saveInterestRequest intentionally never touches matched docs,
// so responses need this dedicated write.
async function updateInterestRequestDb(dbIgnored, requestId, { status, respondedAt }) {
  const set = {};
  if (status !== undefined) set.status = status;
  if (respondedAt !== undefined) set.respondedAt = respondedAt;
  await InterestRequest.updateOne({ id: requestId }, { $set: set });
}

// --- memberships ------------------------------------------------------------------------------
async function saveMembershipDb(dbIgnored, userId, membership, activatedByPaymentId = null) {
  await MembershipModel.updateOne(
    { userId },
    {
      $set: {
        tier: membership.tier ?? null,
        price: membership.price ?? null,
        active: membership.active !== false,
        durationDays: membership.durationDays ?? null,
        meetingsAllowed: membership.meetingsAllowed ?? 0,
        usedMeetings: membership.usedMeetings || 0,
        meetingsLeft: membership.meetingsLeft ?? null,
        profilesAllowed: membership.profilesAllowed ?? 0,
        sharedProfilesCount: membership.sharedProfilesCount || 0,
        startedAt: membership.startedAt || Date.now(),
        expiresAt: membership.expiresAt ?? null,
        activatedByPaymentId,
        updatedAt: Date.now(),
      },
    },
    { upsert: true }
  );
}

// --- documents -----------------------------------------------------------------------------------
async function saveDocument(dbIgnored, meta) {
  const { id, ...rest } = meta;
  await DocumentModel.updateOne({ id }, { $set: rest }, { upsert: true });
}

async function listDocuments(dbIgnored, userId) {
  const rows = await DocumentModel.find(userId ? { userId } : {}).sort({ uploadedAt: -1 }).lean();
  return rows.map((r) => ({ ...r, id: r.id }));
}

async function setDocumentStatus(dbIgnored, id, status, rejectionReason = null) {
  await DocumentModel.updateOne({ id }, { $set: { status, rejectionReason, reviewedAt: Date.now() } });
}

// --- appointments ---------------------------------------------------------------------------------
async function saveAppointment(dbIgnored, appointment) {
  const { id, ...rest } = appointment;
  await AppointmentModel.updateOne({ id }, { $set: rest }, { upsert: true });
}

async function listAppointments(dbIgnored, userId) {
  const filter = userId ? { userId } : {};
  const rows = await AppointmentModel.find(filter).sort({ createdAt: -1 }).lean();
  return rows.map((r) => ({ ...r, id: r.id }));
}

async function setAppointmentStatusDb(dbIgnored, id, status, { feedback = undefined } = {}) {
  const set = { status };
  if (status === 'Completed') set.completedAt = Date.now();
  if (feedback !== undefined) set.feedback = feedback;
  await AppointmentModel.updateOne({ id }, { $set: set });
}

// --- shortlists & interests -------------------------------------------------------------------------
async function toggleShortlistDb(dbIgnored, userId, profileId) {
  const existing = await ShortlistModel.findOne({ userId, profileId }).lean();
  if (existing) await ShortlistModel.deleteOne({ _id: existing._id });
  else await ShortlistModel.create({ id: uuid(), userId, profileId });
  const rows = await ShortlistModel.find({ userId }).lean();
  return rows.map((r) => r.profileId);
}

async function getShortlistDb(dbIgnored, userId) {
  const rows = await ShortlistModel.find({ userId }).lean();
  return rows.map((r) => r.profileId);
}

async function addInterestDb(dbIgnored, userId, profileId) {
  const now = Date.now();
  await InterestModel.updateOne({ userId, profileId }, { $setOnInsert: { userId, profileId, createdAt: now } }, { upsert: true });
  await saveNotificationDb(dbIgnored, { id: uuid(), toUserId: profileId, fromUserId: userId, type: 'interest', payload: '{}', at: now });
}

// --- notifications ------------------------------------------------------------------------------------
async function saveNotificationDb(dbIgnored, notification) {
  const { id, ...rest } = notification;
  await NotificationModel.updateOne({ id }, { $setOnInsert: rest }, { upsert: true });
}

async function getNotificationsDb(dbIgnored, userId) {
  const rows = await NotificationModel.find({ toUserId: userId }).sort({ at: -1 }).lean();
  return rows.map((n) => ({ id: n.id, toUserId: n.toUserId, fromUserId: n.fromUserId, type: n.type, payload: n.payload || '', at: n.at }));
}

// --- admin internal notes --------------------------------------------------------------------------------
async function saveInternalNoteDb(dbIgnored, note) {
  const { id, ...rest } = note;
  await InternalNote.updateOne({ id }, { $setOnInsert: rest }, { upsert: true });
}

async function listInternalNotesDb(dbIgnored, targetType, targetId = null) {
  const filter = targetId ? { targetType, targetId } : { targetType };
  const rows = await InternalNote.find(filter).sort({ createdAt: -1 }).lean();
  const out = [];
  for (const r of rows) {
    const author = r.authorId ? await getUserById(dbIgnored, r.authorId) : null;
    out.push({ ...r, id: r.id, authorIdentifier: author?.identifier || null });
  }
  return out;
}

// --- inquiries ---------------------------------------------------------------------------------------------
async function saveInquiryDb(dbIgnored, inquiry) {
  const { id, ...rest } = inquiry;
  await InquiryModel.updateOne({ id }, { $set: rest }, { upsert: true });
}

function mapInquiryRow(row) {
  return {
    id: row.id,
    name: row.name || '',
    mobile: row.mobile || null,
    email: row.email || null,
    subject: row.subject || 'General enquiry',
    message: row.message || '',
    status: row.status || 'New',
    adminNote: row.adminNote || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function listInquiriesDb(dbIgnored, status = null) {
  const filter = status ? { status } : {};
  const rows = await InquiryModel.find(filter).sort({ createdAt: -1 }).lean();
  return rows.map(mapInquiryRow);
}

async function getInquiryByIdDb(dbIgnored, id) {
  const row = await InquiryModel.findOne({ id }).lean();
  return row ? mapInquiryRow(row) : null;
}

async function setInquiryStatusDb(dbIgnored, id, status, adminNote = undefined) {
  const set = { status, updatedAt: Date.now() };
  if (adminNote !== undefined) set.adminNote = adminNote;
  await InquiryModel.updateOne({ id }, { $set: set });
}

// --- audit trail ----------------------------------------------------------------------------------------------
async function saveAuditLogDb(dbIgnored, entry) {
  const { id, ...rest } = entry;
  await AuditLog.updateOne({ id }, { $setOnInsert: rest }, { upsert: true });
}

async function listAuditLogsDb(dbIgnored, { targetUserId = null, actorId = null, action = null, from = null, to = null, limit = 200 } = {}) {
  const q = {};
  if (targetUserId) q.targetUserId = targetUserId;
  if (actorId) q.adminId = actorId;
  if (action) q.action = action;
  if (from) q.createdAt = { ...(q.createdAt || {}), $gte: Number(from) };
  if (to) q.createdAt = { ...(q.createdAt || {}), $lte: Number(to) };
  const rows = await AuditLog.find(q).sort({ createdAt: -1 }).limit(limit).lean();
  return rows.map((r) => ({ id: r.id, adminId: r.adminId ?? null, action: r.action, targetUserId: r.targetUserId ?? null, detail: r.detail || '', ipAddress: r.ipAddress || '', createdAt: r.createdAt }));
}

// --- session revocation ------------------------------------------------------------------------------------------
async function setTokenRevocationDb(dbIgnored, userId, revokedAt) {
  await Revocation.updateOne({ userId }, { $set: { revokedAt } }, { upsert: true });
}

// --- account deletion -----------------------------------------------------------------------------------------------
// Customer self-service: anonymize + purge (financial rows scrubbed but kept).
async function anonymizeAndPurgeUser(dbIgnored, userId) {
  const files = [];
  const docs = await DocumentModel.find({ userId }).lean();
  for (const d of docs) if (d.path) files.push(d.path);
  const pays = await PaymentModel.find({ userId, receiptPath: { $ne: null } }).lean();
  for (const p of pays) if (p.receiptPath) files.push(p.receiptPath);

  await Promise.all([
    DocumentModel.deleteMany({ userId }),
    MatrimonialProfile.deleteMany({ userId }),
    ShortlistModel.deleteMany({ userId }),
    InterestModel.deleteMany({ userId }),
    NotificationModel.deleteMany({ $or: [{ toUserId: userId }, { fromUserId: userId }] }),
    InterestRequest.deleteMany({ $or: [{ fromUserId: userId }, { toProfileId: userId }] }),
    AppointmentModel.deleteMany({ userId }),
    MembershipModel.deleteMany({ userId }),
    MatchAssignment.deleteMany({ $or: [{ customerId: userId }, { candidateId: userId }] }),
    InternalNote.deleteMany({ targetType: 'profile', targetId: userId }),
    Revocation.deleteMany({ userId }),
  ]);
  // Financial rows stay for accounting; PII columns are scrubbed.
  await PaymentModel.updateMany(
    { userId },
    { $set: { upiId: null, receiptPath: null, receiptName: null, receiptMimetype: null, receiptSize: null } }
  );
  const anonIdentifier = `deleted-${userId}@anonymized.invalid`;
  await User.updateOne({ id: userId }, { $set: { identifier: anonIdentifier, email: null, fullName: null, deletedAt: Date.now() } });
  return { files, anonIdentifier };
}

// Admin panel "Delete user" (PRD §3/§4): permanent hard delete of EVERYTHING
// including the user document itself. Returns file paths for disk cleanup.
async function deleteUserCascade(dbIgnored, userId) {
  const files = [];
  const docs = await DocumentModel.find({ userId }).lean();
  for (const d of docs) if (d.path) files.push(d.path);
  const pays = await PaymentModel.find({ userId, receiptPath: { $ne: null } }).lean();
  for (const p of pays) if (p.receiptPath) files.push(p.receiptPath);

  await Promise.all([
    DocumentModel.deleteMany({ userId }),
    MatrimonialProfile.deleteMany({ userId }),
    ShortlistModel.deleteMany({ userId }),
    InterestModel.deleteMany({ userId }),
    NotificationModel.deleteMany({ $or: [{ toUserId: userId }, { fromUserId: userId }] }),
    InterestRequest.deleteMany({ $or: [{ fromUserId: userId }, { toProfileId: userId }] }),
    AppointmentModel.deleteMany({ userId }),
    MembershipModel.deleteMany({ userId }),
    MatchAssignment.deleteMany({ $or: [{ customerId: userId }, { candidateId: userId }] }),
    InternalNote.deleteMany({ $or: [{ targetId: userId }, { authorId: userId }] }),
    PaymentModel.deleteMany({ userId }),
    Revocation.deleteMany({ userId }),
    Otp.deleteMany({ identifier: new RegExp(`.*${userId}.*`) }),
  ]);
  await User.deleteOne({ id: userId });
  return { files };
}

// --- OTP (real verification, PRD §2) ---------------------------------------------------------------------------------
// Codes are stored hashed with an expiry handled by the TTL index. Rate
// limiting is enforced by counting recent sends straight from MongoDB, so it
// survives restarts and works across instances.
async function saveOtp({ identifier, codeHash, purpose = 'login', ttlMs }) {
  const doc = await Otp.create({
    identifier: String(identifier).toLowerCase().trim(),
    codeHash,
    purpose,
    attempts: 0,
    createdAt: Date.now(),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return plain(doc);
}

async function latestActiveOtp(identifier, purpose = 'login') {
  const doc = await Otp.findOne({
    identifier: String(identifier).toLowerCase().trim(),
    purpose,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 }).lean();
  return doc || null;
}

async function countRecentOtps(identifier, windowMs) {
  return Otp.countDocuments({
    identifier: String(identifier).toLowerCase().trim(),
    createdAt: { $gt: Date.now() - windowMs },
  });
}

async function incrementOtpAttempts(id) {
  await Otp.updateOne({ _id: id }, { $inc: { attempts: 1 } });
}

async function consumeOtp(id) {
  await Otp.updateOne({ _id: id }, { $set: { consumedAt: Date.now() } });
}

module.exports = {
  init,
  hydrateStore,
  isMongo: true,
  createUser,
  getUserByIdentifier,
  getUserById,
  setUserRole,
  backfillUserEmail,
  listUsers,
  upsertProfile,
  getProfile,
  mapProfileRow,
  listMembershipPlansDb,
  getPlanDb,
  setProfileReview,
  submitProfileForReviewDb,
  listProfilesByStatusDb,
  saveMatchAssignmentDb,
  listMatchAssignmentsDb,
  savePrivacyDb,
  upsertPrivacyOnly,
  savePayment,
  setPaymentStatus,
  getPaymentById,
  getPaymentByOrderId,
  listPayments,
  listPaymentsByUserDb,
  saveInterestRequest,
  updateInterestRequestDb,
  backfillUserEmail,
  listPaymentsByUserDb,
  getInquiryByIdDb,
  updateInterestRequestDb,
  saveMembershipDb,
  saveDocument,
  listDocuments,
  saveAppointment,
  listAppointments,
  setAppointmentStatusDb,
  setDocumentStatus,
  toggleShortlistDb,
  getShortlistDb,
  addInterestDb,
  saveNotificationDb,
  getNotificationsDb,
  saveInternalNoteDb,
  listInternalNotesDb,
  saveInquiryDb,
  listInquiriesDb,
  getInquiryByIdDb,
  setInquiryStatusDb,
  mapInquiryRow,
  saveAuditLogDb,
  listAuditLogsDb,
  setTokenRevocationDb,
  anonymizeAndPurgeUser,
  deleteUserCascade,
  saveOtp,
  latestActiveOtp,
  countRecentOtps,
  incrementOtpAttempts,
  consumeOtp,
  models: () => ({ User, MatrimonialProfile, Document: DocumentModel, Appointment: AppointmentModel, Payment: PaymentModel, AuditLog, Otp, MembershipPlan, Membership: MembershipModel, MatchAssignment, InterestRequest, Shortlist: ShortlistModel, Interest: InterestModel, Notification: NotificationModel, InternalNote, Inquiry: InquiryModel, Revocation }),
  DEFAULT_PLANS,
};
