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

module.exports = { ROLES, ASSIGNABLE_ROLES, STAFF_ROLES, PERMISSIONS, permissionsFor, isStaffRole, requireStaffRole, requirePermission };
