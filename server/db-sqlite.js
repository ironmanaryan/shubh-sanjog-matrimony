const path = require('path');
const fs = require('fs');
const paths = require('./paths');

// The native sqlite3 binding is a development convenience only. On Vercel the
// project directory is read-only and Supabase is the configured primary, so a
// missing/unloadable native module must degrade gracefully rather than crash
// the whole API bundle at import time.
let sqlite3 = null;
let open = null;
try {
  sqlite3 = require('sqlite3');
  open = require('sqlite').open;
} catch (err) {
  console.warn(
    '[db-sqlite] native sqlite3 unavailable — SQLite fallback disabled:',
    err && err.message ? err.message : err
  );
}

const DB_PATH = paths.isWritable(path.join(paths.serverDir, 'data'))
  ? paths.sqliteDbPath
  : path.join('/tmp', 'shubh-sanjog', 'database.sqlite');

let _shared = null; // module-wide handle used by the newer helpers

async function init() {
  if (!sqlite3 || !open) {
    throw new Error('SQLite fallback unavailable (native sqlite3 module not loaded)');
  }

  const dir = path.dirname(DB_PATH);
  // turbopackIgnore: runtime filesystem probe; see server/app.js for details.
  if (!fs.existsSync(/* turbopackIgnore: true */ dir)) {
    fs.mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });
  }

  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  _shared = db;

  // OTP codes (hashed) with expiry-based filtering + attempt counters
  await db.exec(`
    CREATE TABLE IF NOT EXISTS otps (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      codeHash TEXT NOT NULL,
      purpose TEXT DEFAULT 'login',
      attempts INTEGER DEFAULT 0,
      consumedAt INTEGER,
      createdAt INTEGER,
      expiresAt INTEGER
    );
  `);
  try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_otps_identifier ON otps (identifier, createdAt);`); } catch (e) { /* ignore */ }

  // Appointment lifecycle columns
  try {
    const apptInfo = await db.all(`PRAGMA table_info(appointments);`);
    const apptCols = apptInfo.map((c) => c.name);
    if (!apptCols.includes('completedAt')) await db.exec(`ALTER TABLE appointments ADD COLUMN completedAt INTEGER`);
    if (!apptCols.includes('feedback')) await db.exec(`ALTER TABLE appointments ADD COLUMN feedback TEXT`);
  } catch (e) { /* ignore */ }

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
      at INTEGER,
      readAt INTEGER
    );
  `);
  // Migration for pre-existing dev databases: add the readAt column if the
  // table was created before realtime notifications shipped.
  await db.run(`ALTER TABLE notifications ADD COLUMN readAt INTEGER`).catch(() => {});

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

  // Enterprise audit trail (privacy spec §31) — every administrative access or
  // change to user sensitive data is recorded here.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      adminId TEXT,
      action TEXT,
      targetUserId TEXT,
      detail TEXT,
      ipAddress TEXT,
      createdAt INTEGER
    );
  `);
  try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs (targetUserId, createdAt);`); } catch (e) { /* ignore */ }
  try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs (adminId, createdAt);`); } catch (e) { /* ignore */ }

  // Session revocation registry — any JWT for a user issued before revokedAt
  // is treated as invalid (used by account deletion / security responses).
  await db.exec(`
    CREATE TABLE IF NOT EXISTS auth_revocations (
      userId TEXT PRIMARY KEY,
      revokedAt INTEGER
    );
  `);

  // Soft-delete marker on the user row itself (account deletion & anonymization).
  const usersInfo = await db.all(`PRAGMA table_info(users);`);
  if (!usersInfo.some((column) => column.name === 'deletedAt')) {
    await db.exec(`ALTER TABLE users ADD COLUMN deletedAt INTEGER;`);
  }

  return db;
}

async function hydrateStore(db) {
  const { store } = require('./data/store');

  const [users, profiles, documents, shortlists, interests, notifications, payments, interestRequests, memberships, auditRows, revocationRows] = await Promise.all([
    db.all('SELECT * FROM users ORDER BY createdAt DESC'),
    db.all('SELECT * FROM profiles'),
    db.all('SELECT * FROM documents ORDER BY uploadedAt DESC'),
    db.all('SELECT * FROM shortlists'),
    db.all('SELECT * FROM interests'),
    db.all('SELECT * FROM notifications ORDER BY at DESC'),
    db.all('SELECT * FROM payments ORDER BY createdAt DESC'),
    db.all('SELECT * FROM interest_requests ORDER BY createdAt DESC'),
    db.all('SELECT * FROM memberships'),
    db.all('SELECT * FROM audit_logs ORDER BY createdAt DESC LIMIT 5000'),
    db.all('SELECT * FROM auth_revocations'),
  ]);

  store.users.clear();
  store.profiles.clear();
  store.documents.clear();
  store.shortlists.clear();
  store.interests.clear();
  store.payments.clear();
  store.notifications = [];
  store.interestRequests = [];
  store.auditLogs = [];
  store.tokenRevocations.clear();

  for (const user of users) {
    store.users.set(user.id, {
      id: user.id,
      identifier: user.identifier,
      email: user.email || null,
      role: user.role || 'customer',
      createdAt: user.createdAt,
      deletedAt: user.deletedAt || null,
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

  // Audit trail (latest first from SQL; keep chronological in memory) and the
  // session revocation registry.
  store.auditLogs = auditRows.slice().reverse();
  for (const row of revocationRows) {
    store.tokenRevocations.set(row.userId, Number(row.revokedAt || 0));
  }

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

async function listPaymentsByUserDb(db, userId) {
  return db.all(`SELECT * FROM payments WHERE userId = ? ORDER BY createdAt DESC`, [userId]);
}

// --- Interest requests with status tracking (Pending / Accepted / Rejected) ---
async function saveInterestRequest(db, request) {
  await db.run(
    `INSERT OR REPLACE INTO interest_requests (id, fromUserId, toProfileId, status, message, createdAt, respondedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [request.id, request.fromUserId, request.toProfileId, request.status || 'Pending', request.message || '', request.createdAt || Date.now(), request.respondedAt || null]
  );
}

async function updateInterestRequestDb(db, requestId, patch = {}) {
  const sets = [];
  const values = [];
  if (patch.status !== undefined) { sets.push('status = ?'); values.push(patch.status); }
  if (patch.respondedAt !== undefined) { sets.push('respondedAt = ?'); values.push(patch.respondedAt); }
  if (!sets.length) return;
  values.push(requestId);
  await db.run(`UPDATE interest_requests SET ${sets.join(', ')} WHERE id = ?`, values);
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

// Best-effort backfill of the optional email on repeat sign-ins (never
// overwrites an existing non-null value).
async function backfillUserEmail(db, userId, email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!userId || !normalized) return;
  await db.run(`UPDATE users SET email = COALESCE(email, ?) WHERE id = ?`, [normalized, userId]);
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

async function deleteDocument(db, id) {
  return db.run(`DELETE FROM documents WHERE id = ?`, [id]);
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

// Mark one notification (id) or all (id === null) as read for a user.
async function markNotificationsReadDb(db, userId, id = null) {
  const now = Date.now();
  if (id) {
    await db.run(`UPDATE notifications SET readAt = ? WHERE toUserId = ? AND id = ? AND readAt IS NULL`, [now, userId, id]);
  } else {
    await db.run(`UPDATE notifications SET readAt = ? WHERE toUserId = ? AND readAt IS NULL`, [now, userId]);
  }
  return 0; // SQLite dev fallback — count is not critical here
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

async function getInquiryByIdDb(db, id) {
  const row = await db.get(`SELECT * FROM inquiries WHERE id = ?`, [id]);
  return row ? mapInquiryRow(row) : null;
}

async function setInquiryStatusDb(db, id, status, adminNote = undefined) {
  if (adminNote === undefined) {
    await db.run(`UPDATE inquiries SET status = ?, updatedAt = ? WHERE id = ?`, [status, Date.now(), id]);
    return;
  }
  await db.run(`UPDATE inquiries SET status = ?, adminNote = ?, updatedAt = ? WHERE id = ?`, [status, adminNote, Date.now(), id]);
}

// --- Audit trail (privacy spec §31) ------------------------------------------
async function saveAuditLogDb(db, entry) {
  await db.run(
    `INSERT INTO audit_logs (id, adminId, action, targetUserId, detail, ipAddress, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [entry.id, entry.adminId || null, entry.action, entry.targetUserId || null, entry.detail || '', entry.ipAddress || '', entry.createdAt]
  );
}

async function listAuditLogsDb(db, { targetUserId = null, actorId = null, action = null, from = null, to = null, limit = 200 } = {}) {
  const clauses = [];
  const params = [];
  if (targetUserId) { clauses.push('targetUserId = ?'); params.push(targetUserId); }
  if (actorId) { clauses.push('adminId = ?'); params.push(actorId); }
  if (action) { clauses.push('action = ?'); params.push(action); }
  if (from) { clauses.push('createdAt >= ?'); params.push(Number(from)); }
  if (to) { clauses.push('createdAt <= ?'); params.push(Number(to)); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await db.all(`SELECT * FROM audit_logs ${where} ORDER BY createdAt DESC LIMIT ?`, [...params, limit]);
  return rows;
}

// --- Session revocation -------------------------------------------------------
async function setTokenRevocationDb(db, userId, revokedAt) {
  await db.run(
    `INSERT INTO auth_revocations (userId, revokedAt) VALUES (?, ?)
     ON CONFLICT(userId) DO UPDATE SET revokedAt = excluded.revokedAt`,
    [userId, revokedAt]
  );
}

// --- Account deletion & anonymization (privacy spec §32) ----------------------
// Removes/anonymizes all customer PII while retaining minimal financial
// records (amount/plan/status/UTR) for accounting. Returns the list of file
// paths that the caller should unlink from disk. The user row itself is kept
// for referential integrity but scrubbed and marked with deletedAt.
async function anonymizeAndPurgeUser(db, userId) {
  const files = [];

  const docs = await db.all('SELECT path FROM documents WHERE userId = ?', [userId]);
  for (const d of docs) if (d.path) files.push(d.path);

  const pays = await db.all('SELECT receiptPath FROM payments WHERE userId = ? AND receiptPath IS NOT NULL', [userId]);
  for (const p of pays) if (p.receiptPath) files.push(p.receiptPath);

  await db.run('DELETE FROM documents WHERE userId = ?', [userId]);
  await db.run('DELETE FROM profiles WHERE userId = ?', [userId]);
  await db.run('DELETE FROM shortlists WHERE userId = ?', [userId]);
  await db.run('DELETE FROM interests WHERE userId = ?', [userId]);
  await db.run('DELETE FROM notifications WHERE toUserId = ? OR fromUserId = ?', [userId, userId]);
  await db.run('DELETE FROM interest_requests WHERE fromUserId = ? OR toProfileId = ?', [userId, userId]);
  await db.run('DELETE FROM appointments WHERE userId = ?', [userId]);
  await db.run('DELETE FROM memberships WHERE userId = ?', [userId]);
  await db.run('DELETE FROM match_assignments WHERE customerId = ? OR candidateId = ?', [userId, userId]);
  await db.run("DELETE FROM internal_notes WHERE targetType = 'profile' AND targetId = ?", [userId]);
  // Financial rows stay; personally identifying columns are scrubbed.
  await db.run(
    'UPDATE payments SET upiId = NULL, receiptPath = NULL, receiptName = NULL, receiptMimetype = NULL, receiptSize = NULL WHERE userId = ?',
    [userId]
  );

  const anonIdentifier = `deleted-${userId}@anonymized.invalid`;
  await db.run('UPDATE users SET identifier = ?, email = NULL, deletedAt = ? WHERE id = ?', [anonIdentifier, Date.now(), userId]);

  return { files, anonIdentifier };
}

// --- OTP persistence (SQLite mode) ---------------------------------------------
// Mirrors the Mongo Otp collection: hashed codes, TTL-style expiry filtering,
// attempt counters and rate-limit counting.
async function saveOtp({ identifier, codeHash, purpose = 'login', ttlMs }) {
  const db = _shared;
  const now = Date.now();
  await db.run(
    `INSERT INTO otps (identifier, codeHash, purpose, attempts, consumedAt, createdAt, expiresAt) VALUES (?, ?, ?, 0, NULL, ?, ?)`,
    [String(identifier).toLowerCase().trim(), codeHash, purpose, now, now + ttlMs]
  );
}

async function latestActiveOtp(identifier, purpose = 'login') {
  const db = _shared;
  const row = await db.get(
    `SELECT * FROM otps WHERE identifier = ? AND purpose = ? AND consumedAt IS NULL AND expiresAt > ? ORDER BY createdAt DESC LIMIT 1`,
    [String(identifier).toLowerCase().trim(), purpose, Date.now()]
  );
  return row || null;
}

async function countRecentOtps(identifier, windowMs) {
  const db = _shared;
  const row = await db.get(
    `SELECT COUNT(*) AS n FROM otps WHERE identifier = ? AND createdAt > ?`,
    [String(identifier).toLowerCase().trim(), Date.now() - windowMs]
  );
  return Number(row?.n) || 0;
}

async function incrementOtpAttempts(id) {
  const db = _shared;
  await db.run(`UPDATE otps SET attempts = attempts + 1 WHERE id = ?`, [id]);
}

async function consumeOtp(id) {
  const db = _shared;
  await db.run(`UPDATE otps SET consumedAt = ? WHERE id = ?`, [Date.now(), id]);
}

// --- admin user management (SQLite mode) ----------------------------------------
async function setUserRole(db, userId, role) {
  await db.run(`UPDATE users SET role = ? WHERE id = ?`, [role, userId]);
  return getUserById(db, userId);
}

async function listUsers(db) {
  return db.all(`SELECT id, identifier, email, role, createdAt, deletedAt FROM users ORDER BY createdAt DESC`);
}

// Admin panel hard delete — removes every trace of the user.
async function deleteUserCascade(db, userId) {
  const files = [];
  const docs = await db.all('SELECT path FROM documents WHERE userId = ?', [userId]);
  for (const d of docs) if (d.path) files.push(d.path);
  const pays = await db.all('SELECT receiptPath AS p FROM payments WHERE userId = ? AND receiptPath IS NOT NULL', [userId]);
  for (const p of pays) if (p.p) files.push(p.p);

  await Promise.all([
    db.run('DELETE FROM documents WHERE userId = ?', [userId]),
    db.run('DELETE FROM profiles WHERE userId = ?', [userId]),
    db.run('DELETE FROM shortlists WHERE userId = ?', [userId]),
    db.run('DELETE FROM interests WHERE userId = ?', [userId]),
    db.run('DELETE FROM notifications WHERE toUserId = ? OR fromUserId = ?', [userId, userId]),
    db.run('DELETE FROM interest_requests WHERE fromUserId = ? OR toProfileId = ?', [userId, userId]),
    db.run('DELETE FROM appointments WHERE userId = ?', [userId]),
    db.run('DELETE FROM memberships WHERE userId = ?', [userId]),
    db.run('DELETE FROM match_assignments WHERE customerId = ? OR candidateId = ?', [userId, userId]),
    db.run("DELETE FROM internal_notes WHERE targetId = ?", [userId]),
    db.run('DELETE FROM payments WHERE userId = ?', [userId]),
    db.run('DELETE FROM auth_revocations WHERE userId = ?', [userId]),
  ]);
  await db.run('DELETE FROM users WHERE id = ?', [userId]);
  return { files };
}

// --- appointment lifecycle (SQLite mode) ------------------------------------------
async function setAppointmentStatusDb(db, id, status, { feedback = undefined } = {}) {
  if (status === 'Completed') {
    if (feedback !== undefined) await db.run(`UPDATE appointments SET status = ?, feedback = ?, completedAt = ? WHERE id = ?`, [status, feedback, Date.now(), id]);
    else await db.run(`UPDATE appointments SET status = ?, completedAt = ? WHERE id = ?`, [status, Date.now(), id]);
    return;
  }
  if (feedback !== undefined) await db.run(`UPDATE appointments SET status = ?, feedback = ? WHERE id = ?`, [status, feedback, id]);
  else await db.run(`UPDATE appointments SET status = ? WHERE id = ?`, [status, id]);
}

async function getPaymentById(db, id) {
  return db.get(`SELECT * FROM payments WHERE id = ?`, [id]);
}

async function saveNotificationDb(db, notification) {
  await db.run(
    `INSERT OR REPLACE INTO notifications (id, toUserId, fromUserId, type, payload, at) VALUES (?, ?, ?, ?, ?, ?)`,
    [notification.id, notification.toUserId, notification.fromUserId ?? null, notification.type, notification.payload || '', notification.at || Date.now()]
  );
}

module.exports = { init, hydrateStore, createUser, getUserByIdentifier, getUserById, backfillUserEmail, upsertProfile, getProfile, mapProfileRow, listMembershipPlansDb, getPlanDb, setProfileReview, submitProfileForReviewDb, listProfilesByStatusDb, saveMatchAssignmentDb, listMatchAssignmentsDb, savePrivacyDb, upsertPrivacyOnly, savePayment, setPaymentStatus, getPaymentById, listPayments, listPaymentsByUserDb, saveInterestRequest, updateInterestRequestDb, saveMembershipDb, saveDocument, listDocuments, saveAppointment, listAppointments, setDocumentStatus, deleteDocument, toggleShortlistDb, getShortlistDb, addInterestDb, getNotificationsDb, markNotificationsReadDb, saveNotificationDb, saveInternalNoteDb, listInternalNotesDb, saveInquiryDb, listInquiriesDb, getInquiryByIdDb, setInquiryStatusDb, mapInquiryRow, saveAuditLogDb, listAuditLogsDb, setTokenRevocationDb, anonymizeAndPurgeUser, deleteUserCascade, setUserRole, listUsers, setAppointmentStatusDb, saveOtp, latestActiveOtp, countRecentOtps, incrementOtpAttempts, consumeOtp };
