const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const DB_PATH = path.join(__dirname, 'data', 'database.sqlite');

async function init() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });

  // create tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      identifier TEXT UNIQUE,
      role TEXT DEFAULT 'customer',
      createdAt INTEGER
    );
  `);

  const tableInfo = await db.all('PRAGMA table_info(users);');
  const hasRoleColumn = tableInfo.some((column) => column.name === 'role');
  if (!hasRoleColumn) {
    await db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'customer';`);
  }
  // Email is strictly optional (phone + OTP is the primary identity). Nullable
  // column — multiple NULLs never collide in unique lookups.
  const hasEmailColumn = tableInfo.some((column) => column.name === 'email');
  if (!hasEmailColumn) {
    await db.exec(`ALTER TABLE users ADD COLUMN email TEXT;`);
  }

  await db.exec(`UPDATE users SET role = 'admin' WHERE role IS NULL AND LOWER(identifier) LIKE '%admin%';`);
  await db.exec(`UPDATE users SET role = 'customer' WHERE role IS NULL;`);
  
  // ensure WAL mode for concurrency
  try { await db.exec("PRAGMA journal_mode = WAL;"); } catch(e) { /* ignore */ }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      userId TEXT PRIMARY KEY,
      personal TEXT,
      education TEXT,
      family TEXT,
      preferences TEXT,
      profileCompletion INTEGER DEFAULT 0,
      updatedAt INTEGER,
      FOREIGN KEY(userId) REFERENCES users(id)
    );
  `);

  // ensure legacy profiles tables have the expected columns (older DBs predate these)
  const profilesInfo = await db.all(`PRAGMA table_info(profiles);`);
  const profileColumns = profilesInfo.map((c) => c.name);
  if (!profileColumns.includes('personal')) {
    await db.exec(`ALTER TABLE profiles ADD COLUMN personal TEXT;`);
  }
  if (!profileColumns.includes('education')) {
    await db.exec(`ALTER TABLE profiles ADD COLUMN education TEXT;`);
  }
  if (!profileColumns.includes('family')) {
    await db.exec(`ALTER TABLE profiles ADD COLUMN family TEXT;`);
  }
  if (!profileColumns.includes('preferences')) {
    await db.exec(`ALTER TABLE profiles ADD COLUMN preferences TEXT;`);
  }
  if (!profileColumns.includes('profileCompletion')) {
    await db.exec(`ALTER TABLE profiles ADD COLUMN profileCompletion INTEGER DEFAULT 0;`);
  }
  if (!profileColumns.includes('updatedAt')) {
    await db.exec(`ALTER TABLE profiles ADD COLUMN updatedAt INTEGER;`);
  }
  if (!profileColumns.includes('privacy')) {
    await db.exec(`ALTER TABLE profiles ADD COLUMN privacy TEXT;`);
  }

  // UPI payment submissions awaiting manual verification (scope: UPI payment gateway)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      userId TEXT,
      plan TEXT,
      amount INTEGER,
      upiId TEXT,
      utr TEXT,
      receiptPath TEXT,
      receiptName TEXT,
      receiptMimetype TEXT,
      receiptSize INTEGER,
      status TEXT DEFAULT 'Pending Verification',
      rejectionReason TEXT,
      createdAt INTEGER,
      reviewedAt INTEGER,
      FOREIGN KEY(userId) REFERENCES users(id)
    );
  `);

  // Express Interest requests with status tracking (Pending / Accepted / Rejected)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS interest_requests (
      id TEXT PRIMARY KEY,
      fromUserId TEXT,
      toProfileId TEXT,
      status TEXT DEFAULT 'Pending',
      message TEXT,
      createdAt INTEGER,
      respondedAt INTEGER
    );
  `);

  // Persisted membership activations (written when a UPI payment is approved)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS memberships (
      userId TEXT PRIMARY KEY,
      tier TEXT,
      price INTEGER,
      active INTEGER DEFAULT 0,
      durationDays INTEGER,
      meetingsAllowed INTEGER,
      usedMeetings INTEGER DEFAULT 0,
      meetingsLeft INTEGER,
      profilesAllowed INTEGER,
      sharedProfilesCount INTEGER DEFAULT 0,
      startedAt INTEGER,
      expiresAt INTEGER,
      activatedByPaymentId TEXT,
      updatedAt INTEGER,
      FOREIGN KEY(userId) REFERENCES users(id)
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      userId TEXT,
      originalName TEXT,
      path TEXT,
      mimetype TEXT,
      size INTEGER,
      uploadedAt INTEGER,
      status TEXT DEFAULT 'Pending',
      rejectionReason TEXT,
      documentType TEXT
    );
  `);

  // ensure documents has expected columns for older DBs
  try {
    const info = await db.all(`PRAGMA table_info(documents);`);
    const names = info.map((c) => c.name);
    if (!names.includes('rejectionReason')) {
      await db.exec(`ALTER TABLE documents ADD COLUMN rejectionReason TEXT;`);
    }
    if (!names.includes('status')) {
      await db.exec(`ALTER TABLE documents ADD COLUMN status TEXT DEFAULT 'Pending';`);
    }
    if (!names.includes('documentType')) {
      await db.exec(`ALTER TABLE documents ADD COLUMN documentType TEXT;`);
    }
  } catch (e) { /* ignore */ }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      userId TEXT,
      date TEXT,
      time TEXT,
      type TEXT,
      notes TEXT,
      status TEXT DEFAULT 'Booked',
      createdAt INTEGER,
      FOREIGN KEY(userId) REFERENCES users(id)
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS shortlists (
      userId TEXT,
      profileId TEXT,
      PRIMARY KEY (userId, profileId)
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS interests (
      userId TEXT,
      profileId TEXT,
      createdAt INTEGER,
      PRIMARY KEY (userId, profileId)
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      toUserId TEXT,
      fromUserId TEXT,
      type TEXT,
      payload TEXT,
      at INTEGER
    );
  `);

  // Single source of truth for pricing tiers (scope PDF §9). Seeded from the
  // catalog in data/store.js; runtime reads MUST go through this table.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS membership_plans (
      tier TEXT PRIMARY KEY,
      name TEXT,
      price INTEGER,
      durationDays INTEGER,
      meetingsAllowed INTEGER,
      profilesMin INTEGER DEFAULT 0,
      profilesMax INTEGER DEFAULT 0,
      priorityAssistance INTEGER DEFAULT 0,
      description TEXT,
      features TEXT,
      popular INTEGER DEFAULT 0,
      sortOrder INTEGER,
      active INTEGER DEFAULT 1
    );
  `);
  const plansCount = await db.get(`SELECT COUNT(*) AS n FROM membership_plans`);
  if (!plansCount || Number(plansCount.n) === 0) {
    const { MEMBERSHIP_PACKAGES } = require('./data/plan-catalog');
    for (const plan of Object.values(MEMBERSHIP_PACKAGES)) {
      await db.run(
        `INSERT INTO membership_plans (tier, name, price, durationDays, meetingsAllowed, profilesMin, profilesMax, priorityAssistance, description, features, popular, sortOrder, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [plan.tier, plan.name, plan.price, plan.durationDays, plan.meetingsAllowed, plan.profilesMin, plan.profilesMax, plan.priorityAssistance ? 1 : 0, plan.description, JSON.stringify(plan.features), plan.popular ? 1 : 0, plan.sortOrder]
      );
    }
    console.log('Seeded membership_plans with contract tiers (Consultation / Gold / Premium)');
  }

  // Admin matchmaking assignments persisted for tracking + audit
  await db.exec(`
    CREATE TABLE IF NOT EXISTS match_assignments (
      id TEXT PRIMARY KEY,
      customerId TEXT,
      candidateId TEXT,
      note TEXT,
      assignedBy TEXT,
      assignedAt INTEGER
    );
  `);

  // Profile review workflow (scope PDF §22: Draft / Submitted / Under Review / Approved / Rejected)
  const profileCols = (await db.all(`PRAGMA table_info(profiles);`)).map((c) => c.name);
  if (!profileCols.includes('status')) await db.exec(`ALTER TABLE profiles ADD COLUMN status TEXT DEFAULT 'Draft';`);
  if (!profileCols.includes('reviewNote')) await db.exec(`ALTER TABLE profiles ADD COLUMN reviewNote TEXT;`);
  if (!profileCols.includes('submittedAt')) await db.exec(`ALTER TABLE profiles ADD COLUMN submittedAt INTEGER;`);
  if (!profileCols.includes('reviewedAt')) await db.exec(`ALTER TABLE profiles ADD COLUMN reviewedAt INTEGER;`);

  // Admin-only internal notes (scope PDF §31) — never exposed to customers.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS internal_notes (
      id TEXT PRIMARY KEY,
      targetType TEXT,
      targetId TEXT,
      authorId TEXT,
      note TEXT,
      createdAt INTEGER
    );
  `);
  try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_internal_notes_target ON internal_notes (targetType, targetId);`); } catch (e) { /* ignore */ }

  // Contact Us inquiries — public submissions managed by staff from the
  // dedicated Admin Inquiries route (scope: Inquiry Management).
  await db.exec(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id TEXT PRIMARY KEY,
      name TEXT,
      mobile TEXT,
      email TEXT,
      subject TEXT,
      message TEXT,
      status TEXT DEFAULT 'New',
      adminNote TEXT,
      createdAt INTEGER,
      updatedAt INTEGER
    );
  `);
  try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries (status);`); } catch (e) { /* ignore */ }

  return db;
}

async function hydrateStore(db) {
  const { store } = require('./data/store');

  const [users, profiles, documents, shortlists, interests, notifications, payments, interestRequests, memberships] = await Promise.all([
    db.all('SELECT * FROM users ORDER BY createdAt DESC'),
    db.all('SELECT * FROM profiles'),
    db.all('SELECT * FROM documents ORDER BY uploadedAt DESC'),
    db.all('SELECT * FROM shortlists'),
    db.all('SELECT * FROM interests'),
    db.all('SELECT * FROM notifications ORDER BY at DESC'),
    db.all('SELECT * FROM payments ORDER BY createdAt DESC'),
    db.all('SELECT * FROM interest_requests ORDER BY createdAt DESC'),
    db.all('SELECT * FROM memberships'),
  ]);

  store.users.clear();
  store.profiles.clear();
  store.documents.clear();
  store.shortlists.clear();
  store.interests.clear();
  store.payments.clear();
  store.notifications = [];
  store.interestRequests = [];

  for (const user of users) {
    store.users.set(user.id, {
      id: user.id,
      identifier: user.identifier,
      email: user.email || null,
      role: user.role || 'customer',
      createdAt: user.createdAt,
    });
  }

  for (const profileRow of profiles) {
    const mapped = mapProfileRow(profileRow);
    store.profiles.set(mapped.userId, mapped);
  }

  for (const doc of documents) {
    store.documents.set(doc.id, {
      id: doc.id,
      userId: doc.userId,
      originalName: doc.originalName,
      path: doc.path,
      mimetype: doc.mimetype,
      size: doc.size,
      uploadedAt: doc.uploadedAt,
      status: doc.status || 'Pending',
      rejectionReason: doc.rejectionReason || null,
      documentType: doc.documentType || null,
    });
  }

  for (const row of shortlists) {
    const current = store.shortlists.get(row.userId) || new Set();
    current.add(row.profileId);
    store.shortlists.set(row.userId, current);
  }

  for (const row of interests) {
    const current = store.interests.get(row.userId) || new Set();
    current.add(row.profileId);
    store.interests.set(row.userId, current);
  }

  for (const row of payments) {
    store.payments.set(row.id, {
      id: row.id,
      userId: row.userId,
      plan: row.plan,
      amount: row.amount,
      upiId: row.upiId,
      utr: row.utr,
      receiptPath: row.receiptPath,
      receiptName: row.receiptName,
      receiptMimetype: row.receiptMimetype,
      receiptSize: row.receiptSize,
      status: row.status || 'Pending Verification',
      rejectionReason: row.rejectionReason || null,
      createdAt: row.createdAt,
      reviewedAt: row.reviewedAt,
    });
  }

  store.interestRequests = interestRequests.map((row) => ({
    id: row.id,
    fromUserId: row.fromUserId,
    toProfileId: row.toProfileId,
    status: row.status || 'Pending',
    message: row.message || '',
    createdAt: row.createdAt,
    respondedAt: row.respondedAt,
  }));

  for (const row of memberships) {
    store.memberships.set(row.userId, {
      tier: row.tier,
      price: row.price,
      active: row.active === 1,
      durationDays: row.durationDays,
      meetingsAllowed: row.meetingsAllowed,
      usedMeetings: row.usedMeetings || 0,
      meetingsLeft: row.meetingsLeft,
      profilesAllowed: row.profilesAllowed,
      sharedProfilesCount: row.sharedProfilesCount || 0,
      startedAt: row.startedAt,
      expiresAt: row.expiresAt,
      activatedByPaymentId: row.activatedByPaymentId || null,
    });
  }

  store.notifications = notifications;
  return store;
}

async function createUser(db, user) {
  const role = user.role || 'customer';
  await db.run(`INSERT OR IGNORE INTO users (id, identifier, email, role, createdAt) VALUES (?, ?, ?, ?, ?);`, [user.id, user.identifier, user.email ?? null, role, user.createdAt]);
}

async function getUserByIdentifier(db, identifier) {
  return db.get(`SELECT * FROM users WHERE identifier = ?`, [identifier]);
}

async function upsertProfile(db, userId, profile) {
  const now = Date.now();
  const existing = await db.get(`SELECT * FROM profiles WHERE userId = ?`, [userId]);
  const personal = JSON.stringify(profile.personal || {});
  const education = JSON.stringify(profile.education || {});
  const family = JSON.stringify(profile.family || {});
  const preferences = JSON.stringify(profile.preferences || {});
  const privacy = JSON.stringify(profile.privacy || {});
  const completion = Number(profile.profileCompletion || 0);
  if (existing) {
    await db.run(
      `UPDATE profiles SET personal = ?, education = ?, family = ?, preferences = ?, privacy = ?, profileCompletion = ?, status = ?, reviewNote = ?, submittedAt = ?, reviewedAt = ?, updatedAt = ? WHERE userId = ?`,
      [personal, education, family, preferences, privacy, completion, profile.status || existing.status || 'Draft', profile.reviewNote ?? existing.reviewNote ?? null, profile.submittedAt ?? existing.submittedAt ?? null, profile.reviewedAt ?? existing.reviewedAt ?? null, now, userId]
    );
  } else {
    await db.run(
      `INSERT INTO profiles (userId, personal, education, family, preferences, privacy, profileCompletion, status, reviewNote, submittedAt, reviewedAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, personal, education, family, preferences, privacy, completion, profile.status || 'Draft', profile.reviewNote || null, profile.submittedAt || null, profile.reviewedAt || null, now]
    );
  }
}

function mapProfileRow(row) {
  return {
    userId: row.userId,
    personal: row.personal ? JSON.parse(row.personal) : {},
    education: row.education ? JSON.parse(row.education) : {},
    family: row.family ? JSON.parse(row.family) : {},
    preferences: row.preferences ? JSON.parse(row.preferences) : {},
    privacy: row.privacy ? JSON.parse(row.privacy) : {},
    profileCompletion: row.profileCompletion || 0,
    status: row.status || 'Draft',
    reviewNote: row.reviewNote || null,
    submittedAt: row.submittedAt || null,
    reviewedAt: row.reviewedAt || null,
    updatedAt: row.updatedAt,
  };
}

async function getProfile(db, userId) {
  const row = await db.get(`SELECT * FROM profiles WHERE userId = ?`, [userId]);
  if (!row) return null;
  return mapProfileRow(row);
}

// --- Membership plans (single source of truth: membership_plans table) ---
async function listMembershipPlansDb(db) {
  const rows = await db.all(`SELECT * FROM membership_plans WHERE active = 1 ORDER BY sortOrder ASC`);
  return rows.map((row) => ({
    tier: row.tier,
    name: row.name,
    price: Number(row.price),
    durationDays: Number(row.durationDays),
    meetingsAllowed: Number(row.meetingsAllowed),
    profilesMin: Number(row.profilesMin || 0),
    profilesMax: Number(row.profilesMax || 0),
    priorityAssistance: row.priorityAssistance === 1,
    description: row.description || '',
    features: row.features ? JSON.parse(row.features) : [],
    popular: row.popular === 1,
  }));
}

async function getPlanDb(db, tier) {
  const row = await db.get(`SELECT * FROM membership_plans WHERE LOWER(tier) = LOWER(?) AND active = 1`, [String(tier || '').trim()]);
  if (!row) return null;
  return {
    tier: row.tier,
    name: row.name,
    price: Number(row.price),
    durationDays: Number(row.durationDays),
    meetingsAllowed: Number(row.meetingsAllowed),
    profilesMin: Number(row.profilesMin || 0),
    profilesMax: Number(row.profilesMax || 0),
    priorityAssistance: row.priorityAssistance === 1,
    description: row.description || '',
    features: row.features ? JSON.parse(row.features) : [],
    popular: row.popular === 1,
  };
}

// --- Profile review workflow (admin actions + customer submission) ---
async function setProfileReview(db, userId, { status, reviewNote = null }) {
  await db.run(
    `UPDATE profiles SET status = ?, reviewNote = ?, reviewedAt = ? WHERE userId = ?`,
    [status, reviewNote, Date.now(), userId]
  );
}

async function submitProfileForReviewDb(db, userId, completion) {
  await db.run(
    `UPDATE profiles SET status = 'Submitted', reviewNote = NULL, submittedAt = ?, profileCompletion = ? WHERE userId = ?`,
    [Date.now(), Number(completion || 0), userId]
  );
}

async function listProfilesByStatusDb(db, statuses) {
  const placeholders = statuses.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT p.*, u.identifier AS customerIdentifier FROM profiles p LEFT JOIN users u ON u.id = p.userId WHERE p.status IN (${placeholders}) ORDER BY p.submittedAt DESC`,
    statuses
  );
  return rows.map(mapProfileRow);
}

// --- Admin matchmaking assignments (persisted) ---
async function saveMatchAssignmentDb(db, assignment) {
  await db.run(
    `INSERT OR REPLACE INTO match_assignments (id, customerId, candidateId, note, assignedBy, assignedAt) VALUES (?, ?, ?, ?, ?, ?)`,
    [assignment.id, assignment.customerId, assignment.candidateId, assignment.note || '', assignment.assignedBy || null, assignment.assignedAt || Date.now()]
  );
}

async function listMatchAssignmentsDb(db, customerId = null) {
  if (customerId) {
    return db.all(`SELECT * FROM match_assignments WHERE customerId = ? ORDER BY assignedAt DESC`, [customerId]);
  }
  return db.all(`SELECT * FROM match_assignments ORDER BY assignedAt DESC`);
}

// --- Privacy toggles (hide photo / hide phone until interest accepted) ---
async function savePrivacyDb(db, userId, privacy) {
  await upsertPrivacyOnly(db, userId, privacy);
}

async function upsertPrivacyOnly(db, userId, privacy) {
  const existing = await db.get(`SELECT userId FROM profiles WHERE userId = ?`, [userId]);
  const encoded = JSON.stringify(privacy || {});
  if (existing) {
    await db.run(`UPDATE profiles SET privacy = ? WHERE userId = ?`, [encoded, userId]);
  } else {
    await db.run(`INSERT INTO profiles (userId, privacy, profileCompletion) VALUES (?, ?, 0)`, [userId, encoded]);
  }
}

// --- UPI payments (Pending Verification / Approved / Rejected) ---
async function savePayment(db, payment) {
  await db.run(
    `INSERT OR REPLACE INTO payments (id, userId, plan, amount, upiId, utr, receiptPath, receiptName, receiptMimetype, receiptSize, status, rejectionReason, createdAt, reviewedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payment.id,
      payment.userId,
      payment.plan,
      payment.amount,
      payment.upiId || null,
      payment.utr,
      payment.receiptPath || null,
      payment.receiptName || null,
      payment.receiptMimetype || null,
      payment.receiptSize || null,
      payment.status || 'Pending Verification',
      payment.rejectionReason || null,
      payment.createdAt || Date.now(),
      payment.reviewedAt || null,
    ]
  );
}

async function setPaymentStatus(db, id, status, rejectionReason = null) {
  await db.run(`UPDATE payments SET status = ?, rejectionReason = ?, reviewedAt = ? WHERE id = ?`, [status, rejectionReason, Date.now(), id]);
}

async function listPayments(db) {
  return db.all(`SELECT * FROM payments ORDER BY createdAt DESC`);
}

// --- Interest requests with status tracking (Pending / Accepted / Rejected) ---
async function saveInterestRequest(db, request) {
  await db.run(
    `INSERT OR REPLACE INTO interest_requests (id, fromUserId, toProfileId, status, message, createdAt, respondedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [request.id, request.fromUserId, request.toProfileId, request.status || 'Pending', request.message || '', request.createdAt || Date.now(), request.respondedAt || null]
  );
}

// --- Persisted memberships (activated after payment approval) ---
async function saveMembershipDb(db, userId, membership, activatedByPaymentId = null) {
  await db.run(
    `INSERT OR REPLACE INTO memberships (userId, tier, price, active, durationDays, meetingsAllowed, usedMeetings, meetingsLeft, profilesAllowed, sharedProfilesCount, startedAt, expiresAt, activatedByPaymentId, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      membership.tier || null,
      membership.price || null,
      membership.active === false ? 0 : 1,
      membership.durationDays || null,
      membership.meetingsAllowed || null,
      membership.usedMeetings || 0,
      membership.meetingsLeft ?? null,
      membership.profilesAllowed || null,
      membership.sharedProfilesCount || 0,
      membership.startedAt || Date.now(),
      membership.expiresAt || null,
      activatedByPaymentId,
      Date.now(),
    ]
  );
}

async function getUserById(db, id) {
  return db.get(`SELECT * FROM users WHERE id = ?`, [id]);
}

async function saveDocument(db, meta) {
  await db.run(`INSERT OR REPLACE INTO documents (id, userId, originalName, path, mimetype, size, uploadedAt, status, rejectionReason, documentType) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [meta.id, meta.userId, meta.originalName, meta.path, meta.mimetype, meta.size, meta.uploadedAt, meta.status || 'Pending', meta.rejectionReason || null, meta.documentType || null]);
}

async function listDocuments(db, userId) {
  return db.all(`SELECT * FROM documents WHERE userId = ? ORDER BY uploadedAt DESC`, [userId]);
}

async function saveAppointment(db, appointment) {
  await db.run(`INSERT OR REPLACE INTO appointments (id, userId, date, time, type, notes, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
    appointment.id,
    appointment.userId,
    appointment.date,
    appointment.time,
    appointment.type,
    appointment.notes || '',
    appointment.status || 'Booked',
    appointment.createdAt || Date.now(),
  ]);
}

async function listAppointments(db, userId) {
  return db.all(`SELECT * FROM appointments WHERE userId = ? ORDER BY createdAt DESC`, [userId]);
}

async function setDocumentStatus(db, id, status, rejectionReason = null) {
  return db.run(`UPDATE documents SET status = ?, rejectionReason = ? WHERE id = ?`, [status, rejectionReason, id]);
}

async function toggleShortlistDb(db, userId, profileId) {
  const exists = await db.get(`SELECT 1 FROM shortlists WHERE userId = ? AND profileId = ?`, [userId, profileId]);
  if (exists) {
    await db.run(`DELETE FROM shortlists WHERE userId = ? AND profileId = ?`, [userId, profileId]);
  } else {
    await db.run(`INSERT INTO shortlists (userId, profileId) VALUES (?, ?)`, [userId, profileId]);
  }
  const rows = await db.all(`SELECT profileId FROM shortlists WHERE userId = ?`, [userId]);
  return rows.map(r => r.profileId);
}

async function getShortlistDb(db, userId) {
  const rows = await db.all(`SELECT profileId FROM shortlists WHERE userId = ?`, [userId]);
  return rows.map(r => r.profileId);
}

async function addInterestDb(db, userId, profileId) {
  const now = Date.now();
  await db.run(`INSERT OR IGNORE INTO interests (userId, profileId, createdAt) VALUES (?, ?, ?);`, [userId, profileId, now]);
  // add notification
  const nid = require('uuid').v4();
  await db.run(`INSERT INTO notifications (id, toUserId, fromUserId, type, payload, at) VALUES (?, ?, ?, ?, ?, ?);`, [nid, profileId, userId, 'interest', '{}', now]);
}

async function getNotificationsDb(db, userId) {
  return db.all(`SELECT * FROM notifications WHERE toUserId = ? ORDER BY at DESC`, [userId]);
}

// --- Admin internal notes (scope PDF §31) ------------------------------------
async function saveInternalNoteDb(db, note) {
  await db.run(
    `INSERT INTO internal_notes (id, targetType, targetId, authorId, note, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
    [note.id, note.targetType, note.targetId, note.authorId, note.note || '', note.createdAt || Date.now()]
  );
}

// targetId optional: when omitted, return every note for the targetType.
async function listInternalNotesDb(db, targetType, targetId = null) {
  if (targetId) {
    return db.all(
      `SELECT n.*, u.identifier AS authorIdentifier FROM internal_notes n LEFT JOIN users u ON u.id = n.authorId
       WHERE n.targetType = ? AND n.targetId = ? ORDER BY n.createdAt DESC`,
      [targetType, targetId]
    );
  }
  return db.all(
    `SELECT n.*, u.identifier AS authorIdentifier FROM internal_notes n LEFT JOIN users u ON u.id = n.authorId
     WHERE n.targetType = ? ORDER BY n.createdAt DESC`,
    [targetType]
  );
}

// --- Contact Us inquiries (Admin Inquiries management) -----------------------
async function saveInquiryDb(db, inquiry) {
  await db.run(
    `INSERT OR REPLACE INTO inquiries (id, name, mobile, email, subject, message, status, adminNote, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      inquiry.id,
      inquiry.name || null,
      inquiry.mobile || null,
      inquiry.email || null,
      inquiry.subject || 'General enquiry',
      inquiry.message || '',
      inquiry.status || 'New',
      inquiry.adminNote || null,
      inquiry.createdAt || Date.now(),
      inquiry.updatedAt || Date.now(),
    ]
  );
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

async function listInquiriesDb(db, status = null) {
  if (status) {
    const rows = await db.all(`SELECT * FROM inquiries WHERE status = ? ORDER BY createdAt DESC`, [status]);
    return rows.map(mapInquiryRow);
  }
  const rows = await db.all(`SELECT * FROM inquiries ORDER BY createdAt DESC`);
  return rows.map(mapInquiryRow);
}

async function setInquiryStatusDb(db, id, status, adminNote = undefined) {
  if (adminNote === undefined) {
    await db.run(`UPDATE inquiries SET status = ?, updatedAt = ? WHERE id = ?`, [status, Date.now(), id]);
    return;
  }
  await db.run(`UPDATE inquiries SET status = ?, adminNote = ?, updatedAt = ? WHERE id = ?`, [status, adminNote, Date.now(), id]);
}

module.exports = { init, hydrateStore, createUser, getUserByIdentifier, getUserById, upsertProfile, getProfile, mapProfileRow, listMembershipPlansDb, getPlanDb, setProfileReview, submitProfileForReviewDb, listProfilesByStatusDb, saveMatchAssignmentDb, listMatchAssignmentsDb, savePrivacyDb, upsertPrivacyOnly, savePayment, setPaymentStatus, listPayments, saveInterestRequest, saveMembershipDb, saveDocument, listDocuments, saveAppointment, listAppointments, setDocumentStatus, toggleShortlistDb, getShortlistDb, addInterestDb, getNotificationsDb, saveInternalNoteDb, listInternalNotesDb, saveInquiryDb, listInquiriesDb, setInquiryStatusDb, mapInquiryRow };
