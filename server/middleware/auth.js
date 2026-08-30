const jwt = require('jsonwebtoken');
const { store } = require('../data/store');
const { matchesAdminIdentifier } = require('./rbac');
const db = require('../db');

// Supabase Auth — optional, falls back to JWT when not configured
let supabaseVerifier = null;
try {
  supabaseVerifier = require('../utils/supabase').verifySupabaseToken;
} catch {
  supabaseVerifier = null;
}

const { getJwtSecret } = require('../secrets');

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
  if (user && typeof user.identifier === 'string' && matchesAdminIdentifier(user.identifier)) return 'admin';
  return 'customer';
}

function signToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

async function resolveUserById(userId) {
  let user = store.users.get(userId);
  if (!user && db._db) {
    try {
      const row = await db.getUserById(db._db, userId);
      if (row) {
        user = {
          id: row.id,
          identifier: row.identifier,
          role: row.role || 'customer',
          createdAt: row.createdAt,
          deletedAt: row.deletedAt || null,
        };
        store.users.set(user.id, user);
      }
    } catch (e) {
      console.warn('db lookup failed in auth middleware', e);
    }
  }
  return user || null;
}

function verifyTokenMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  // Resolve per request: in production a missing JWT_SECRET must surface as a
  // clear 500 rather than silently verifying against the dev default.
  let secret;
  try {
    secret = getJwtSecret();
  } catch (err) {
    console.error('[auth]', err.message);
    return res.status(500).json({ error: 'Server authentication is not configured' });
  }

  // 1) Try legacy JWT (HS256 with JWT_SECRET)
  jwt.verify(token, secret, async (err, decoded) => {
    if (!err && decoded && decoded.userId) {
      const user = await resolveUserById(decoded.userId);
      if (!user) return res.status(401).json({ error: 'User not found' });
      if (user.deletedAt) return res.status(401).json({ error: 'Account no longer active' });
      const revokedAt = store.tokenRevocations.get(decoded.userId);
      if (revokedAt && Number(decoded.iat || 0) * 1000 < Number(revokedAt)) {
        return res.status(401).json({ error: 'Session expired — please sign in again' });
      }
      req.user = {
        ...user,
        id: user.id,
        identifier: user.identifier,
        role: resolveUserRole(user, decoded),
        createdAt: user.createdAt,
      };
      return next();
    }

    // 2) Fallback: Supabase Auth token (when Supabase is configured)
    if (supabaseVerifier) {
      try {
        const supabaseUser = await supabaseVerifier(token);
        if (supabaseUser) {
          const identifier = (supabaseUser.email || supabaseUser.phone || supabaseUser.id || '').toLowerCase();
          let user = store.users.get(supabaseUser.id);
          if (!user) user = await resolveUserById(supabaseUser.id);
          // If user not in our store yet, synthesize minimal user from Supabase identity
          if (!user && identifier) {
            user = {
              id: supabaseUser.id,
              identifier,
              role: supabaseUser.app_metadata?.role || supabaseUser.user_metadata?.role || (matchesAdminIdentifier(identifier) ? 'admin' : 'customer'),
              createdAt: supabaseUser.created_at ? new Date(supabaseUser.created_at).getTime() : Date.now(),
              deletedAt: null,
            };
            store.users.set(user.id, user);
          }
          if (!user) return res.status(401).json({ error: 'User not found' });
          if (user.deletedAt) return res.status(401).json({ error: 'Account no longer active' });
          req.user = {
            ...user,
            id: user.id,
            identifier: user.identifier,
            role: resolveUserRole(user, { role: supabaseUser.app_metadata?.role }),
            createdAt: user.createdAt,
          };
          return next();
        }
      } catch (e) {
        console.warn('supabase token verification failed', e.message);
      }
    }

    return res.status(401).json({ error: 'Invalid or expired token' });
  });
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Admin role required' });
  }
  return next();
}

module.exports = { signToken, verifyTokenMiddleware, requireAdmin };
