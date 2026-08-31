// Supabase PostgreSQL persistence driver — replaces MongoDB/Mongoose.
// Implements the same function surface as db-mongo.js / db-sqlite.js so every
// controller/route stays storage-agnostic. Uses @supabase/supabase-js with
// service_role key (server) and anon key fallback. Falls back to no-op hydrate
// when Supabase is unreachable so the hydrated in-memory store keeps serving.

const crypto = require('crypto');
const { getSupabaseAdmin } = require('./utils/supabase');

function uuid() {
  return crypto.randomUUID();
}

// Table names — mirrors previous Mongo collections / SQLite tables
const TABLES = {
  users: 'users',
  profiles: 'matrimonial_profiles',
  documents: 'documents',
  appointments: 'appointments',
  payments: 'payments',
  audit_logs: 'audit_logs',
  otps: 'otps',
  membership_plans: 'membership_plans',
  memberships: 'memberships',
  match_assignments: 'match_assignments',
  interest_requests: 'interest_requests',
  shortlists: 'shortlists',
  interests: 'interests',
  notifications: 'notifications',
  internal_notes: 'internal_notes',
  inquiries: 'inquiries',
  revocations: 'auth_revocations',
};

function getClient() {
  return getSupabaseAdmin();
}

async function init() {
  const client = getClient();
  if (!client) throw new Error('SUPABASE_URL / SERVICE_ROLE_KEY not configured');
  // Verify connectivity — select 1 row from users
  const { error } = await client.from(TABLES.users).select('id').limit(1);
  if (error && error.code !== 'PGRST116') {
    // If table missing, init still succeeds — store will be empty until migrations run
    console.warn('[db-supabase] init check warning:', error.message);
  }
  // Seed canonical plans if missing
  try {
    const { data: plans } = await client.from(TABLES.membership_plans).select('tier').limit(1);
    if (!plans || plans.length === 0) {
      const { MEMBERSHIP_PACKAGES } = require('./data/plan-catalog');
      for (const plan of Object.values(MEMBERSHIP_PACKAGES)) {
        await client.from(TABLES.membership_plans).upsert(
          {
            tier: plan.tier,
            name: plan.name,
            price: plan.price,
            duration_days: plan.durationDays,
            meetings_allowed: plan.meetingsAllowed,
            profiles_min: plan.profilesMin,
            profiles_max: plan.profilesMax,
            priority_assistance: plan.priorityAssistance,
            description: plan.description,
            features: JSON.stringify(plan.features),
            popular: plan.popular,
            sort_order: plan.sortOrder,
            active: true,
          },
          { onConflict: 'tier' }
        );
      }
      console.log('[db-supabase] Seeded membership_plans');
    }
  } catch (e) {
    console.warn('[db-supabase] plan seeding failed:', e.message);
  }

  // Bootstrap admins
  try {
    const adminIdentifiers = [
      'aryansadanshiv8@gmail.com',
      ...String(process.env.ADMIN_EMAILS || 'admin@shubhsanjog.com').split(','),
      ...String(process.env.ADMIN_IDENTIFIERS || '').split(','),
    ]
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    for (const identifier of [...new Set(adminIdentifiers)]) {
      await client.from(TABLES.users).upsert(
        { id: uuid(), identifier, role: 'admin', created_at: Date.now() },
        { onConflict: 'identifier', ignoreDuplicates: false }
      );
      // Force role to admin even if exists
      await client.from(TABLES.users).update({ role: 'admin' }).eq('identifier', identifier);
    }
  } catch (e) {
    console.warn('[db-supabase] admin bootstrap failed:', e.message);
  }

  return client;
}

async function hydrateStore(client) {
  const { store } = require('./data/store');
  const supa = client || getClient();
  if (!supa) return store;

  try {
    const [
      { data: users },
      { data: profiles },
      { data: documents },
      { data: shortlists },
      { data: interests },
      { data: notifications },
      { data: payments },
      { data: interestRequests },
      { data: memberships },
      { data: auditRows },
      { data: appointments },
      { data: matchAssignments },
      { data: revocations },
    ] = await Promise.all([
      supa.from(TABLES.users).select('*'),
      supa.from(TABLES.profiles).select('*'),
      supa.from(TABLES.documents).select('*'),
      supa.from(TABLES.shortlists).select('*'),
      supa.from(TABLES.interests).select('*'),
      supa.from(TABLES.notifications).select('*').order('at', { ascending: false }),
      supa.from(TABLES.payments).select('*').order('created_at', { ascending: false }),
      supa.from(TABLES.interest_requests).select('*').order('created_at', { ascending: false }),
      supa.from(TABLES.memberships).select('*'),
      supa.from(TABLES.audit_logs).select('*').order('created_at', { ascending: false }).limit(5000),
      supa.from(TABLES.appointments).select('*'),
      supa.from(TABLES.match_assignments).select('*').order('assigned_at', { ascending: false }),
      supa.from(TABLES.revocations).select('*'),
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

    for (const u of users || []) {
      store.users.set(u.id, {
        id: u.id,
        identifier: u.identifier,
        email: u.email || null,
        fullName: u.full_name || null,
        role: u.role || 'customer',
        createdAt: u.created_at,
        deletedAt: u.deleted_at || null,
      });
    }
    for (const p of profiles || []) {
      store.profiles.set(p.user_id, {
        userId: p.user_id,
        personal: typeof p.personal === 'string' ? JSON.parse(p.personal) : p.personal || {},
        education: typeof p.education === 'string' ? JSON.parse(p.education) : p.education || {},
        family: typeof p.family === 'string' ? JSON.parse(p.family) : p.family || {},
        preferences: typeof p.preferences === 'string' ? JSON.parse(p.preferences) : p.preferences || {},
        privacy: typeof p.privacy === 'string' ? JSON.parse(p.privacy) : p.privacy || {},
        profileCompletion: p.profile_completion || 0,
        status: p.status || 'Draft',
        reviewNote: p.review_note || null,
        submittedAt: p.submitted_at || null,
        reviewedAt: p.reviewed_at || null,
        updatedAt: p.updated_at,
      });
    }
    for (const d of documents || []) {
      store.documents.set(d.id, {
        id: d.id,
        userId: d.user_id,
        originalName: d.original_name,
        storedName: d.stored_name,
        path: d.path || d.cloudinary_url,
        cloudinaryUrl: d.cloudinary_url || null,
        cloudinaryPublicId: d.cloudinary_public_id || null,
        mimetype: d.mimetype,
        size: d.size,
        documentType: d.document_type || 'identity',
        status: d.status || 'Pending',
        rejectionReason: d.rejection_reason || null,
        uploadedAt: d.uploaded_at,
        reviewedAt: d.reviewed_at || null,
      });
    }
    for (const row of shortlists || []) {
      const cur = store.shortlists.get(row.user_id) || new Set();
      cur.add(row.profile_id);
      store.shortlists.set(row.user_id, cur);
    }
    for (const row of interests || []) {
      const cur = store.interests.get(row.user_id) || new Set();
      cur.add(row.profile_id);
      store.interests.set(row.user_id, cur);
    }
    for (const p of payments || []) {
      store.payments.set(p.id, {
        id: p.id,
        userId: p.user_id,
        plan: p.plan,
        amount: p.amount,
        upiId: p.upi_id,
        utr: p.utr,
        receiptPath: p.receipt_path || p.cloudinary_url,
        cloudinaryUrl: p.cloudinary_url || null,
        receiptName: p.receipt_name,
        receiptMimetype: p.receipt_mimetype,
        receiptSize: p.receipt_size,
        gateway: p.gateway || 'manual_upi',
        status: p.status || 'Pending Verification',
        rejectionReason: p.rejection_reason || null,
        createdAt: p.created_at,
        reviewedAt: p.reviewed_at || null,
      });
    }
    store.notifications = (notifications || []).map((n) => ({
      id: n.id,
      toUserId: n.to_user_id,
      fromUserId: n.from_user_id,
      type: n.type,
      payload: n.payload || '',
      at: n.at,
    }));
    store.interestRequests = (interestRequests || []).map((r) => ({
      id: r.id,
      fromUserId: r.from_user_id,
      toProfileId: r.to_profile_id,
      status: r.status || 'Pending',
      message: r.message || '',
      createdAt: r.created_at,
      respondedAt: r.responded_at || null,
    }));
    for (const m of memberships || []) {
      store.memberships.set(m.user_id, {
        tier: m.tier,
        price: m.price || null,
        active: m.active === true,
        durationDays: m.duration_days || null,
        meetingsAllowed: m.meetings_allowed || 0,
        usedMeetings: m.used_meetings || 0,
        meetingsLeft: m.meetings_left || null,
        profilesAllowed: m.profiles_allowed || 0,
        sharedProfilesCount: m.shared_profiles_count || 0,
        startedAt: m.started_at || null,
        expiresAt: m.expires_at || null,
        activatedByPaymentId: m.activated_by_payment_id || null,
      });
    }
    store.auditLogs = (auditRows || []).slice().reverse().map((r) => ({
      id: r.id,
      adminId: r.admin_id,
      action: r.action,
      targetUserId: r.target_user_id,
      detail: r.detail || '',
      ipAddress: r.ip_address || '',
      createdAt: r.created_at,
    }));
    for (const a of appointments || []) {
      store.appointments.set(a.id, {
        id: a.id,
        userId: a.user_id,
        date: a.date,
        time: a.time,
        type: a.type || 'Consultation',
        notes: a.notes || '',
        status: a.status || 'Booked',
        feedback: a.feedback || null,
        completedAt: a.completed_at || null,
        createdAt: a.created_at,
      });
    }
    for (const row of matchAssignments || []) {
      const list = store.matchAssignments.get(row.customer_id) || [];
      list.push({
        id: row.id,
        customerId: row.customer_id,
        candidateId: row.candidate_id,
        note: row.note || '',
        assignedBy: row.assigned_by || null,
        assignedAt: row.assigned_at,
      });
      store.matchAssignments.set(row.customer_id, list);
    }
    for (const r of revocations || []) {
      store.tokenRevocations.set(r.user_id, Number(r.revoked_at || 0));
    }
  } catch (e) {
    console.warn('[db-supabase] hydrateStore failed:', e.message);
  }
  return store;
}

// --- users ---
async function createUser(_ignored, user) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.users).upsert(
    {
      id: user.id || uuid(),
      identifier: user.identifier,
      email: user.email || null,
      full_name: user.fullName || null,
      role: user.role || 'customer',
      created_at: user.createdAt || Date.now(),
    },
    { onConflict: 'identifier' }
  );
}
async function getUserByIdentifier(_ignored, identifier) {
  const client = getClient();
  if (!client) return null;
  const { data } = await client.from(TABLES.users).select('*').eq('identifier', identifier).maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    identifier: data.identifier,
    email: data.email,
    fullName: data.full_name,
    role: data.role || 'customer',
    createdAt: data.created_at,
    deletedAt: data.deleted_at,
  };
}
async function getUserById(_ignored, id) {
  const client = getClient();
  if (!client) return null;
  const { data } = await client.from(TABLES.users).select('*').eq('id', id).maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    identifier: data.identifier,
    email: data.email,
    fullName: data.full_name,
    role: data.role || 'customer',
    createdAt: data.created_at,
    deletedAt: data.deleted_at,
  };
}
async function setUserRole(_ignored, userId, role) {
  const client = getClient();
  if (client) await client.from(TABLES.users).update({ role }).eq('id', userId);
  return getUserById(null, userId);
}
async function backfillUserEmail(_ignored, userId, email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!userId || !normalized) return;
  const client = getClient();
  if (!client) return;
  // only set if email is null
  const { data } = await client.from(TABLES.users).select('email').eq('id', userId).maybeSingle();
  if (data && !data.email) await client.from(TABLES.users).update({ email: normalized }).eq('id', userId);
}
async function listUsers() {
  const client = getClient();
  if (!client) return [];
  const { data } = await client.from(TABLES.users).select('*').order('created_at', { ascending: false });
  return (data || []).map((u) => ({
    id: u.id,
    identifier: u.identifier,
    email: u.email,
    fullName: u.full_name,
    role: u.role || 'customer',
    createdAt: u.created_at,
    deletedAt: u.deleted_at,
  }));
}

// --- profiles ---
async function upsertProfile(_ignored, userId, profile) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.profiles).upsert(
    {
      user_id: userId,
      personal: profile.personal || {},
      education: profile.education || {},
      family: profile.family || {},
      preferences: profile.preferences || {},
      privacy: profile.privacy || {},
      profile_completion: Number(profile.profileCompletion || 0),
      status: profile.status || 'Draft',
      review_note: profile.reviewNote ?? null,
      submitted_at: profile.submittedAt ?? null,
      reviewed_at: profile.reviewedAt ?? null,
      updated_at: Date.now(),
    },
    { onConflict: 'user_id' }
  );
}
async function getProfile(_ignored, userId) {
  const client = getClient();
  if (!client) return null;
  const { data } = await client.from(TABLES.profiles).select('*').eq('user_id', userId).maybeSingle();
  if (!data) return null;
  return {
    userId: data.user_id,
    personal: typeof data.personal === 'string' ? JSON.parse(data.personal) : data.personal || {},
    education: typeof data.education === 'string' ? JSON.parse(data.education) : data.education || {},
    family: typeof data.family === 'string' ? JSON.parse(data.family) : data.family || {},
    preferences: typeof data.preferences === 'string' ? JSON.parse(data.preferences) : data.preferences || {},
    privacy: typeof data.privacy === 'string' ? JSON.parse(data.privacy) : data.privacy || {},
    profileCompletion: data.profile_completion || 0,
    status: data.status || 'Draft',
    reviewNote: data.review_note ?? null,
    submittedAt: data.submitted_at ?? null,
    reviewedAt: data.reviewed_at ?? null,
    updatedAt: data.updated_at,
  };
}
function mapProfileRow(row) {
  if (!row) return null;
  if (row.userId && row.personal && !row._id) return row;
  return row;
}
async function setProfileReview(_ignored, userId, { status, reviewNote = null }) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.profiles).update({ status, review_note: reviewNote, reviewed_at: Date.now() }).eq('user_id', userId);
}
async function submitProfileForReviewDb(_ignored, userId, completion) {
  const client = getClient();
  if (!client) return;
  await client
    .from(TABLES.profiles)
    .update({ status: 'Submitted', review_note: null, submitted_at: Date.now(), profile_completion: Number(completion || 0) })
    .eq('user_id', userId);
}
async function listProfilesByStatusDb(_ignored, statuses, opts = {}) {
  const client = getClient();
  if (!client) return [];
  // Pagination defaults to 50 rows per page (was unbounded). Admin tables
  // can grow fast; the dashboard already uses statusFilter chips — pass
  // { limit, offset } from the route when the client requests more.
  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 50;
  const offset = Number(opts.offset) >= 0 ? Number(opts.offset) : 0;
  const { data } = await client
    .from(TABLES.profiles)
    .select('user_id, personal, education, family, preferences, privacy, profile_completion, status, review_note, submitted_at, reviewed_at, updated_at')
    .in('status', statuses)
    .order('submitted_at', { ascending: false })
    .range(offset, offset + limit - 1);
  const out = [];
  for (const row of data || []) {
    const mapped = {
      userId: row.user_id,
      personal: typeof row.personal === 'string' ? JSON.parse(row.personal) : row.personal || {},
      education: typeof row.education === 'string' ? JSON.parse(row.education) : row.education || {},
      family: typeof row.family === 'string' ? JSON.parse(row.family) : row.family || {},
      preferences: typeof row.preferences === 'string' ? JSON.parse(row.preferences) : row.preferences || {},
      privacy: typeof row.privacy === 'string' ? JSON.parse(row.privacy) : row.privacy || {},
      profileCompletion: row.profile_completion || 0,
      status: row.status || 'Draft',
      reviewNote: row.review_note ?? null,
      submittedAt: row.submitted_at ?? null,
      reviewedAt: row.reviewed_at ?? null,
      updatedAt: row.updated_at,
    };
    const user = await getUserById(null, mapped.userId);
    mapped.customerIdentifier = user?.identifier || null;
    out.push(mapped);
  }
  return out;
}

// --- plans ---
function mapPlan(row) {
  return {
    tier: row.tier,
    name: row.name,
    price: Number(row.price),
    durationDays: Number(row.duration_days),
    meetingsAllowed: Number(row.meetings_allowed),
    profilesMin: Number(row.profiles_min || 0),
    profilesMax: Number(row.profiles_max || 0),
    priorityAssistance: Boolean(row.priority_assistance),
    description: row.description || '',
    features: typeof row.features === 'string' ? JSON.parse(row.features) : row.features || [],
    popular: Boolean(row.popular),
  };
}
async function listMembershipPlansDb() {
  const client = getClient();
  if (!client) return [];
  const { data } = await client.from(TABLES.membership_plans).select('*').eq('active', true).order('sort_order', { ascending: true });
  return (data || []).map(mapPlan);
}
async function getPlanDb(_ignored, tier) {
  const client = getClient();
  if (!client) return null;
  const { data } = await client
    .from(TABLES.membership_plans)
    .select('*')
    .ilike('tier', String(tier || '').trim())
    .eq('active', true)
    .maybeSingle();
  return data ? mapPlan(data) : null;
}

// --- match assignments ---
async function saveMatchAssignmentDb(_ignored, assignment) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.match_assignments).upsert(
    {
      id: assignment.id,
      customer_id: assignment.customerId,
      candidate_id: assignment.candidateId,
      note: assignment.note || '',
      assigned_by: assignment.assignedBy || null,
      assigned_at: assignment.assignedAt || Date.now(),
    },
    { onConflict: 'id' }
  );
}
async function listMatchAssignmentsDb(_ignored, customerId = null) {
  const client = getClient();
  if (!client) return [];
  let query = client.from(TABLES.match_assignments).select('*').order('assigned_at', { ascending: false });
  if (customerId) query = query.eq('customer_id', customerId);
  const { data } = await query;
  return (data || []).map((r) => ({ id: r.id, customerId: r.customer_id, candidateId: r.candidate_id, note: r.note || '', assignedBy: r.assigned_by, assignedAt: r.assigned_at }));
}

// --- privacy ---
async function upsertPrivacyOnly(_ignored, userId, privacy) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.profiles).upsert({ user_id: userId, privacy: privacy || {}, updated_at: Date.now() }, { onConflict: 'user_id' });
}
async function savePrivacyDb(_ignored, userId, privacy) {
  return upsertPrivacyOnly(null, userId, privacy);
}

// --- payments ---
async function savePayment(_ignored, payment) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.payments).upsert(
    {
      id: payment.id,
      user_id: payment.userId,
      plan: payment.plan,
      amount: payment.amount,
      upi_id: payment.upiId || null,
      utr: payment.utr,
      receipt_path: payment.receiptPath || payment.cloudinaryUrl || null,
      cloudinary_url: payment.cloudinaryUrl || null,
      receipt_name: payment.receiptName || null,
      receipt_mimetype: payment.receiptMimetype || null,
      receipt_size: payment.receiptSize || null,
      gateway: payment.gateway || 'manual_upi',
      status: payment.status || 'Pending Verification',
      rejection_reason: payment.rejectionReason || null,
      created_at: payment.createdAt || Date.now(),
      reviewed_at: payment.reviewedAt || null,
    },
    { onConflict: 'id' }
  );
}
async function setPaymentStatus(_ignored, id, status, rejectionReason = null) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.payments).update({ status, rejection_reason: rejectionReason, reviewed_at: Date.now() }).eq('id', id);
}
async function getPaymentById(_ignored, id) {
  const client = getClient();
  if (!client) return null;
  const { data } = await client.from(TABLES.payments).select('*').eq('id', id).maybeSingle();
  if (!data) return null;
  return { id: data.id, userId: data.user_id, plan: data.plan, amount: data.amount, upiId: data.upi_id, utr: data.utr, receiptPath: data.receipt_path, cloudinaryUrl: data.cloudinary_url, receiptName: data.receipt_name, receiptMimetype: data.receipt_mimetype, receiptSize: data.receipt_size, gateway: data.gateway, status: data.status, rejectionReason: data.rejection_reason, createdAt: data.created_at, reviewedAt: data.reviewed_at };
}
async function getPaymentByOrderId(_ignored, orderId) {
  return getPaymentById(null, orderId);
}
async function listPayments(opts = {}) {
  const client = getClient();
  if (!client) return [];
  // Default cap of 100 rows; admins can request more via { limit, offset }.
  // Without this the payload grows unbounded as the payments table fills up,
  // and the admin dashboard's "Pending review" tab was known to fetch all
  // rows when the in-memory store is not yet hydrated.
  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 100;
  const offset = Number(opts.offset) >= 0 ? Number(opts.offset) : 0;
  const { data } = await client
    .from(TABLES.payments)
    .select('id, user_id, plan, amount, upi_id, utr, receipt_path, cloudinary_url, receipt_name, receipt_mimetype, receipt_size, gateway, status, rejection_reason, created_at, reviewed_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  return (data || []).map((r) => ({ id: r.id, userId: r.user_id, plan: r.plan, amount: r.amount, upiId: r.upi_id, utr: r.utr, receiptPath: r.receipt_path || r.cloudinary_url, cloudinaryUrl: r.cloudinary_url, receiptName: r.receipt_name, receiptMimetype: r.receipt_mimetype, receiptSize: r.receipt_size, gateway: r.gateway, status: r.status, rejectionReason: r.rejection_reason, createdAt: r.created_at, reviewedAt: r.reviewed_at }));
}
async function listPaymentsByUserDb(_ignored, userId, opts = {}) {
  const client = getClient();
  if (!client) return [];
  // Same cap-by-default guard: 50 most recent rows.
  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 50;
  const offset = Number(opts.offset) >= 0 ? Number(opts.offset) : 0;
  const { data } = await client
    .from(TABLES.payments)
    .select('id, user_id, plan, amount, upi_id, utr, receipt_path, cloudinary_url, receipt_name, receipt_mimetype, receipt_size, gateway, status, rejection_reason, created_at, reviewed_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  return (data || []).map((r) => ({ id: r.id, userId: r.user_id, plan: r.plan, amount: r.amount, upiId: r.upi_id, utr: r.utr, receiptPath: r.receipt_path || r.cloudinary_url, cloudinaryUrl: r.cloudinary_url, receiptName: r.receipt_name, receiptMimetype: r.receipt_mimetype, receiptSize: r.receipt_size, gateway: r.gateway, status: r.status, rejectionReason: r.rejection_reason, createdAt: r.created_at, reviewedAt: r.reviewed_at }));
}

// --- interest requests ---
async function saveInterestRequest(_ignored, request) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.interest_requests).upsert(
    {
      id: request.id,
      from_user_id: request.fromUserId,
      to_profile_id: request.toProfileId,
      status: request.status || 'Pending',
      message: request.message || '',
      created_at: request.createdAt || Date.now(),
      responded_at: request.respondedAt || null,
    },
    { onConflict: 'id' }
  );
}
async function updateInterestRequestDb(_ignored, requestId, patch = {}) {
  const client = getClient();
  if (!client) return;
  const set = {};
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.respondedAt !== undefined) set.responded_at = patch.respondedAt;
  if (Object.keys(set).length) await client.from(TABLES.interest_requests).update(set).eq('id', requestId);
}

// --- memberships ---
async function saveMembershipDb(_ignored, userId, membership, activatedByPaymentId = null) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.memberships).upsert(
    {
      user_id: userId,
      tier: membership.tier || null,
      price: membership.price || null,
      active: membership.active !== false,
      duration_days: membership.durationDays || null,
      meetings_allowed: membership.meetingsAllowed || 0,
      used_meetings: membership.usedMeetings || 0,
      meetings_left: membership.meetingsLeft ?? null,
      profiles_allowed: membership.profilesAllowed || 0,
      shared_profiles_count: membership.sharedProfilesCount || 0,
      started_at: membership.startedAt || Date.now(),
      expires_at: membership.expiresAt || null,
      activated_by_payment_id: activatedByPaymentId,
      updated_at: Date.now(),
    },
    { onConflict: 'user_id' }
  );
}

// --- documents ---
async function saveDocument(_ignored, meta) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.documents).upsert(
    {
      id: meta.id,
      user_id: meta.userId,
      original_name: meta.originalName,
      stored_name: meta.storedName || null,
      path: meta.path || meta.cloudinaryUrl || null,
      cloudinary_url: meta.cloudinaryUrl || null,
      cloudinary_public_id: meta.cloudinaryPublicId || null,
      mimetype: meta.mimetype,
      size: meta.size,
      document_type: meta.documentType || 'identity',
      status: meta.status || 'Pending',
      rejection_reason: meta.rejectionReason || null,
      uploaded_at: meta.uploadedAt || Date.now(),
      reviewed_at: meta.reviewedAt || null,
    },
    { onConflict: 'id' }
  );
}
async function listDocuments(_ignored, userId) {
  const client = getClient();
  if (!client) return [];
  let query = client.from(TABLES.documents).select('*').order('uploaded_at', { ascending: false });
  if (userId) query = query.eq('user_id', userId);
  const { data } = await query;
  return (data || []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    originalName: r.original_name,
    storedName: r.stored_name,
    path: r.path || r.cloudinary_url,
    cloudinaryUrl: r.cloudinary_url,
    cloudinaryPublicId: r.cloudinary_public_id,
    mimetype: r.mimetype,
    size: r.size,
    documentType: r.document_type,
    status: r.status || 'Pending',
    rejectionReason: r.rejection_reason || null,
    uploadedAt: r.uploaded_at,
    reviewedAt: r.reviewed_at || null,
  }));
}
async function setDocumentStatus(_ignored, id, status, rejectionReason = null) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.documents).update({ status, rejection_reason: rejectionReason, reviewed_at: Date.now() }).eq('id', id);
}

// --- appointments ---
async function saveAppointment(_ignored, appointment) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.appointments).upsert(
    {
      id: appointment.id,
      user_id: appointment.userId,
      date: appointment.date,
      time: appointment.time,
      type: appointment.type || 'Consultation',
      notes: appointment.notes || '',
      status: appointment.status || 'Booked',
      feedback: appointment.feedback || null,
      completed_at: appointment.completedAt || null,
      created_at: appointment.createdAt || Date.now(),
    },
    { onConflict: 'id' }
  );
}
async function listAppointments(_ignored, userId) {
  const client = getClient();
  if (!client) return [];
  let query = client.from(TABLES.appointments).select('*').order('created_at', { ascending: false });
  if (userId) query = query.eq('user_id', userId);
  const { data } = await query;
  return (data || []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    date: r.date,
    time: r.time,
    type: r.type,
    notes: r.notes,
    status: r.status,
    feedback: r.feedback,
    completedAt: r.completed_at,
    createdAt: r.created_at,
  }));
}
async function setAppointmentStatusDb(_ignored, id, status, { feedback = undefined } = {}) {
  const client = getClient();
  if (!client) return;
  const set = { status };
  if (status === 'Completed') set.completed_at = Date.now();
  if (feedback !== undefined) set.feedback = feedback;
  await client.from(TABLES.appointments).update(set).eq('id', id);
}

// --- shortlists & interests ---
async function toggleShortlistDb(_ignored, userId, profileId) {
  const client = getClient();
  if (!client) return [];
  const { data: existing } = await client.from(TABLES.shortlists).select('id').eq('user_id', userId).eq('profile_id', profileId).maybeSingle();
  if (existing) await client.from(TABLES.shortlists).delete().eq('user_id', userId).eq('profile_id', profileId);
  else await client.from(TABLES.shortlists).insert({ user_id: userId, profile_id: profileId, created_at: Date.now() });
  const { data } = await client.from(TABLES.shortlists).select('profile_id').eq('user_id', userId);
  return (data || []).map((r) => r.profile_id);
}
async function getShortlistDb(_ignored, userId) {
  const client = getClient();
  if (!client) return [];
  const { data } = await client.from(TABLES.shortlists).select('profile_id').eq('user_id', userId);
  return (data || []).map((r) => r.profile_id);
}
async function addInterestDb(_ignored, userId, profileId) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.interests).upsert({ user_id: userId, profile_id: profileId, created_at: Date.now() }, { onConflict: 'user_id,profile_id' });
  await saveNotificationDb(null, { id: uuid(), toUserId: profileId, fromUserId: userId, type: 'interest', payload: '{}', at: Date.now() });
}

// --- notifications ---
async function saveNotificationDb(_ignored, notification) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.notifications).upsert(
    {
      id: notification.id,
      to_user_id: notification.toUserId,
      from_user_id: notification.fromUserId,
      type: notification.type,
      payload: notification.payload || '',
      at: notification.at || Date.now(),
      read_at: notification.readAt || null,
    },
    { onConflict: 'id' }
  );
}
async function getNotificationsDb(_ignored, userId) {
  const client = getClient();
  if (!client) return [];
  const { data } = await client.from(TABLES.notifications).select('*').eq('to_user_id', userId).order('at', { ascending: false });
  return (data || []).map((n) => ({ id: n.id, toUserId: n.to_user_id, fromUserId: n.from_user_id, type: n.type, payload: n.payload || '', at: n.at }));
}

// --- internal notes ---
async function saveInternalNoteDb(_ignored, note) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.internal_notes).upsert(
    {
      id: note.id,
      target_type: note.targetType,
      target_id: note.targetId,
      author_id: note.authorId,
      note: note.note || '',
      created_at: note.createdAt || Date.now(),
    },
    { onConflict: 'id' }
  );
}
async function listInternalNotesDb(_ignored, targetType, targetId = null) {
  const client = getClient();
  if (!client) return [];
  let query = client.from(TABLES.internal_notes).select('*').eq('target_type', targetType).order('created_at', { ascending: false });
  if (targetId) query = query.eq('target_id', targetId);
  const { data } = await query;
  const out = [];
  for (const r of data || []) {
    const author = r.author_id ? await getUserById(null, r.author_id) : null;
    out.push({ id: r.id, targetType: r.target_type, targetId: r.target_id, authorId: r.author_id, note: r.note || '', createdAt: r.created_at, authorIdentifier: author?.identifier || null });
  }
  return out;
}

// --- inquiries ---
async function saveInquiryDb(_ignored, inquiry) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.inquiries).upsert(
    {
      id: inquiry.id,
      name: inquiry.name || null,
      mobile: inquiry.mobile || null,
      email: inquiry.email || null,
      subject: inquiry.subject || 'General enquiry',
      message: inquiry.message || '',
      status: inquiry.status || 'New',
      admin_note: inquiry.adminNote || null,
      created_at: inquiry.createdAt || Date.now(),
      updated_at: inquiry.updatedAt || Date.now(),
    },
    { onConflict: 'id' }
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
    adminNote: row.admin_note || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
async function listInquiriesDb(_ignored, status = null) {
  const client = getClient();
  if (!client) return [];
  let query = client.from(TABLES.inquiries).select('*').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data } = await query;
  return (data || []).map((r) => mapInquiryRow(r));
}
async function getInquiryByIdDb(_ignored, id) {
  const client = getClient();
  if (!client) return null;
  const { data } = await client.from(TABLES.inquiries).select('*').eq('id', id).maybeSingle();
  return data ? mapInquiryRow(data) : null;
}
async function setInquiryStatusDb(_ignored, id, status, adminNote = undefined) {
  const client = getClient();
  if (!client) return;
  const set = { status, updated_at: Date.now() };
  if (adminNote !== undefined) set.admin_note = adminNote;
  await client.from(TABLES.inquiries).update(set).eq('id', id);
}

// --- audit ---
async function saveAuditLogDb(_ignored, entry) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.audit_logs).upsert(
    {
      id: entry.id,
      admin_id: entry.adminId || null,
      action: entry.action,
      target_user_id: entry.targetUserId || null,
      detail: entry.detail || '',
      ip_address: entry.ipAddress || '',
      created_at: entry.createdAt,
    },
    { onConflict: 'id' }
  );
}
async function listAuditLogsDb(_ignored, { targetUserId = null, actorId = null, action = null, from = null, to = null, limit = 200 } = {}) {
  const client = getClient();
  if (!client) return [];
  let query = client.from(TABLES.audit_logs).select('*').order('created_at', { ascending: false }).limit(limit);
  if (targetUserId) query = query.eq('target_user_id', targetUserId);
  if (actorId) query = query.eq('admin_id', actorId);
  if (action) query = query.eq('action', action);
  if (from) query = query.gte('created_at', Number(from));
  if (to) query = query.lte('created_at', Number(to));
  const { data } = await query;
  return (data || []).map((r) => ({ id: r.id, adminId: r.admin_id, action: r.action, targetUserId: r.target_user_id, detail: r.detail || '', ipAddress: r.ip_address || '', createdAt: r.created_at }));
}

// --- revocations ---
async function setTokenRevocationDb(_ignored, userId, revokedAt) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.revocations).upsert({ user_id: userId, revoked_at: revokedAt }, { onConflict: 'user_id' });
}

// --- account deletion ---
async function anonymizeAndPurgeUser(_ignored, userId) {
  const client = getClient();
  const files = [];
  if (client) {
    const { data: docs } = await client.from(TABLES.documents).select('path,cloudinary_url').eq('user_id', userId);
    for (const d of docs || []) if (d.path) files.push(d.path);
    const { data: pays } = await client.from(TABLES.payments).select('receipt_path,cloudinary_url').eq('user_id', userId);
    for (const p of pays || []) if (p.receipt_path) files.push(p.receipt_path);
    await Promise.all([
      client.from(TABLES.documents).delete().eq('user_id', userId),
      client.from(TABLES.profiles).delete().eq('user_id', userId),
      client.from(TABLES.shortlists).delete().eq('user_id', userId),
      client.from(TABLES.interests).delete().eq('user_id', userId),
      client.from(TABLES.notifications).delete().eq('to_user_id', userId),
      client.from(TABLES.notifications).delete().eq('from_user_id', userId),
      client.from(TABLES.interest_requests).delete().eq('from_user_id', userId),
      client.from(TABLES.interest_requests).delete().eq('to_profile_id', userId),
      client.from(TABLES.appointments).delete().eq('user_id', userId),
      client.from(TABLES.memberships).delete().eq('user_id', userId),
      client.from(TABLES.match_assignments).delete().eq('customer_id', userId),
      client.from(TABLES.match_assignments).delete().eq('candidate_id', userId),
      client.from(TABLES.internal_notes).delete().eq('target_id', userId),
      client.from(TABLES.revocations).delete().eq('user_id', userId),
    ]);
    await client.from(TABLES.payments).update({ upi_id: null, receipt_path: null, cloudinary_url: null, receipt_name: null, receipt_mimetype: null, receipt_size: null }).eq('user_id', userId);
    const anonIdentifier = `deleted-${userId}@anonymized.invalid`;
    await client.from(TABLES.users).update({ identifier: anonIdentifier, email: null, full_name: null, deleted_at: Date.now() }).eq('id', userId);
    return { files, anonIdentifier };
  }
  return { files, anonIdentifier: `deleted-${userId}@anonymized.invalid` };
}
async function deleteUserCascade(_ignored, userId) {
  const client = getClient();
  const files = [];
  if (client) {
    const { data: docs } = await client.from(TABLES.documents).select('path').eq('user_id', userId);
    for (const d of docs || []) if (d.path) files.push(d.path);
    const { data: pays } = await client.from(TABLES.payments).select('receipt_path').eq('user_id', userId);
    for (const p of pays || []) if (p.receipt_path) files.push(p.receipt_path);
    await Promise.all([
      client.from(TABLES.documents).delete().eq('user_id', userId),
      client.from(TABLES.profiles).delete().eq('user_id', userId),
      client.from(TABLES.shortlists).delete().eq('user_id', userId),
      client.from(TABLES.interests).delete().eq('user_id', userId),
      client.from(TABLES.notifications).delete().eq('to_user_id', userId),
      client.from(TABLES.interest_requests).delete().eq('from_user_id', userId),
      client.from(TABLES.appointments).delete().eq('user_id', userId),
      client.from(TABLES.memberships).delete().eq('user_id', userId),
      client.from(TABLES.match_assignments).delete().eq('customer_id', userId),
      client.from(TABLES.internal_notes).delete().eq('target_id', userId),
      client.from(TABLES.payments).delete().eq('user_id', userId),
      client.from(TABLES.revocations).delete().eq('user_id', userId),
      client.from(TABLES.otps).delete().eq('identifier', userId),
    ]);
    await client.from(TABLES.users).delete().eq('id', userId);
  }
  return { files };
}

// --- OTP (Supabase) ---
async function saveOtp({ identifier, codeHash, purpose = 'login', ttlMs }) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.otps).insert({
    identifier: String(identifier).toLowerCase().trim(),
    code_hash: codeHash,
    purpose,
    attempts: 0,
    created_at: Date.now(),
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
  });
}
async function latestActiveOtp(identifier, purpose = 'login') {
  const client = getClient();
  if (!client) return null;
  const { data } = await client
    .from(TABLES.otps)
    .select('*')
    .eq('identifier', String(identifier).toLowerCase().trim())
    .eq('purpose', purpose)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id, _id: data.id, identifier: data.identifier, codeHash: data.code_hash, purpose: data.purpose, attempts: data.attempts, consumedAt: data.consumed_at, createdAt: data.created_at, expiresAt: new Date(data.expires_at).getTime() } : null;
}
async function countRecentOtps(identifier, windowMs) {
  const client = getClient();
  if (!client) return 0;
  const { count } = await client
    .from(TABLES.otps)
    .select('id', { count: 'exact', head: true })
    .eq('identifier', String(identifier).toLowerCase().trim())
    .gt('created_at', Date.now() - windowMs);
  return count || 0;
}
async function incrementOtpAttempts(id) {
  const client = getClient();
  if (!client) return;
  const { data } = await client.from(TABLES.otps).select('attempts').eq('id', id).maybeSingle();
  if (data) await client.from(TABLES.otps).update({ attempts: Number(data.attempts || 0) + 1 }).eq('id', id);
}
async function consumeOtp(id) {
  const client = getClient();
  if (!client) return;
  await client.from(TABLES.otps).update({ consumed_at: Date.now() }).eq('id', id);
}

module.exports = {
  init,
  hydrateStore,
  isSupabase: true,
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
  TABLES,
};
