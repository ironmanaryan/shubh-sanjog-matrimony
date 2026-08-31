// Role-Based Access Control (scope PDF §29).
//
// Roles: admin (full access) > relationship_manager (matching + profile review,
// no payment verification / analytics) > staff (read-only queues + analytics +
// internal notes) — customers never reach admin APIs.
const ROLES = {
  ADMIN: 'admin',
  RELATIONSHIP_MANAGER: 'relationship_manager',
  STAFF: 'staff',
  CUSTOMER: 'customer',
};

const ASSIGNABLE_ROLES = [ROLES.ADMIN, ROLES.RELATIONSHIP_MANAGER, ROLES.STAFF, ROLES.CUSTOMER];
const STAFF_ROLES = [ROLES.ADMIN, ROLES.RELATIONSHIP_MANAGER, ROLES.STAFF];

// Permission matrix — every capability an admin panel action maps to one flag.
const PERMISSIONS = {
  [ROLES.ADMIN]: {
    viewQueues: true,        // see profile/document/payment queues + stats
    reviewProfiles: true,    // approve/reject/request-changes on profiles
    verifyPayments: true,    // verify & activate UPI payments
    manageMatches: true,     // assign/recommend matches to customers
    viewAnalytics: true,     // reports & analytics dashboard
    exportAnalytics: true,   // CSV export
    addNotes: true,          // internal notes
    manageTeam: true,        // change user roles
  },
  [ROLES.RELATIONSHIP_MANAGER]: {
    viewQueues: true,
    reviewProfiles: true,
    verifyPayments: false,
    manageMatches: true,
    viewAnalytics: false,
    exportAnalytics: false,
    addNotes: true,
    manageTeam: false,
  },
  [ROLES.STAFF]: {
    viewQueues: true,
    reviewProfiles: false,
    verifyPayments: false,
    manageMatches: false,
    viewAnalytics: true,
    exportAnalytics: true,
    addNotes: true,
    manageTeam: false,
  },
  [ROLES.CUSTOMER]: {
    viewQueues: false,
    reviewProfiles: false,
    verifyPayments: false,
    manageMatches: false,
    viewAnalytics: false,
    exportAnalytics: false,
    addNotes: false,
    manageTeam: false,
  },
};

// --- Admin identity resolution ----------------------------------------------
// Staff can always reach the panel without a pre-seeded DB role: identifiers on
// this list (env-configurable) are treated as admins. aryansadanshiv8@gmail.com
// is the designated owner account (PRD §4) and always resolves to ADMIN.
//
// Matching is EXACT. A previous version also matched any identifier containing
// the substring "admin", which was a privilege-escalation hole: registering
// `admin-attacker@evil.com` — or even `notadmin@example.com` — granted full
// administrator rights.
function normalizeIdentifierValue(value) {
  return String(value || '').trim().toLowerCase();
}

// The owner account (aryansadanshiv8@gmail.com) must stay on this list — it is
// the designated owner per PRD §4. machinesmarvis@gmail.com is the account the
// `admin_users` master-admin record was created with, so both resolve to ADMIN.
// Extra addresses can be added at deploy time via the ADMIN_IDENTIFIERS env var.
const DEFAULT_ADMIN_IDENTIFIERS = [
  'admin@shubhsanjog.com',
  'aryansadanshiv8@gmail.com',
  'machinesmarvis@gmail.com',
];

const ADMIN_IDENTIFIERS = [
  ...DEFAULT_ADMIN_IDENTIFIERS,
  ...String(process.env.ADMIN_IDENTIFIERS || '')
    .split(',')
    .map((value) => normalizeIdentifierValue(value))
    .filter(Boolean),
].map((value) => normalizeIdentifierValue(value));

function matchesAdminIdentifier(identifier) {
  const value = normalizeIdentifierValue(identifier);
  if (!value) return false;
  return ADMIN_IDENTIFIERS.includes(value);
}

function permissionsFor(role) {
  return PERMISSIONS[role] || PERMISSIONS[ROLES.CUSTOMER];
}

function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}

// Any staff role (admin / relationship_manager / staff); blocks customers.
function requireStaffRole(req, res, next) {
  if (!req.user || !isStaffRole(req.user.role)) {
    return res.status(403).json({ ok: false, error: 'Staff role required' });
  }
  return next();
}

// Fine-grained check against the permission matrix.
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user || !permissionsFor(req.user.role)[permission]) {
      return res.status(403).json({ ok: false, error: `Missing permission: ${permission}` });
    }
    return next();
  };
}

// --- Self-data access isolation (scope PDF §30) ------------------------------
// Customers may only ever touch their OWN resources. Any requested resource id
// that does not match the authenticated principal is rejected with HTTP 403
// before a controller runs. Staff roles bypass this for queue workflows;
// per-resource privacy rules (e.g. photograph sharing) stay in the controllers.
function requestedResourceId(req, paramName) {
  return req.params?.[paramName] ?? req.body?.userId ?? req.body?.id ?? null;
}

// Strict variant — only the owner passes, no staff bypass.
function requireSelfAccess(paramName = 'id') {
  return function requireSelfAccessMiddleware(req, res, next) {
    if (!req.user) return res.status(401).json({ ok: false, error: 'Authentication required' });
    const requested = requestedResourceId(req, paramName);
    if (!requested) return res.status(400).json({ ok: false, error: 'Resource id required' });
    if (String(requested) !== String(req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Forbidden: you may only access your own resources' });
    }
    return next();
  };
}

// Owner or staff role; every other cross-account access is blocked with 403.
function requireSelfOrStaff(paramName = 'id') {
  return function requireSelfOrStaffMiddleware(req, res, next) {
    if (!req.user) return res.status(401).json({ ok: false, error: 'Authentication required' });
    if (isStaffRole(req.user.role)) return next();
    const requested = requestedResourceId(req, paramName);
    if (!requested) return res.status(400).json({ ok: false, error: 'Resource id required' });
    if (String(requested) !== String(req.user.id)) {
      return res.status(403).json({ ok: false, error: 'Forbidden: you may only access your own resources' });
    }
    return next();
  };
}

module.exports = { ROLES, ASSIGNABLE_ROLES, STAFF_ROLES, PERMISSIONS, ADMIN_IDENTIFIERS, matchesAdminIdentifier, permissionsFor, isStaffRole, requireStaffRole, requirePermission, requireSelfAccess, requireSelfOrStaff };
