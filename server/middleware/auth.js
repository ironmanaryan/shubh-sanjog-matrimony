const jwt = require('jsonwebtoken');
const { store } = require('../data/store');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-please-change';

// Roles recognized across the platform (scope PDF §29 RBAC)
const KNOWN_ROLES = ['admin', 'relationship_manager', 'staff', 'customer'];

function normalizeRole(role) {
  const raw = String(role || '').trim().toLowerCase();
  if (raw === 'rm') return 'relationship_manager';
  return KNOWN_ROLES.includes(raw) ? raw : null;
}

function resolveUserRole(user, decoded = {}) {
  // Live role wins over the token claim so RBAC changes made by an admin take
  // effect immediately without waiting for the 7-day token to expire (§29).
  if (user) {
    const fromUser = normalizeRole(user.role);
    if (fromUser) return fromUser;
  }
  const fromToken = normalizeRole(decoded.role);
  if (fromToken) return fromToken;
  if (user && typeof user.identifier === 'string' && user.identifier.toLowerCase().includes('admin')) return 'admin';
  return 'customer';
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyTokenMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid or expired token' });

    let user = store.users.get(decoded.userId);
    if (!user) {
      try {
        if (db._db) {
          const row = await db.getUserById(db._db, decoded.userId);
          if (row) {
            user = {
              id: row.id,
              identifier: row.identifier,
              role: row.role || 'customer',
              createdAt: row.createdAt,
            };
            store.users.set(user.id, user);
          }
        }
      } catch (e) {
        console.warn('db lookup failed in auth middleware', e);
      }
    }

    if (!user) return res.status(401).json({ error: 'User not found' });

    req.user = {
      ...user,
      id: user.id,
      identifier: user.identifier,
      role: resolveUserRole(user, decoded),
      createdAt: user.createdAt,
    };

    next();
  });
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Admin role required' });
  }
  return next();
}

module.exports = { signToken, verifyTokenMiddleware, requireAdmin };
