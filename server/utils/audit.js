// Enterprise audit logging (privacy spec §31).
//
// Every administrative access to, or change of, user sensitive data is
// recorded with: actor (adminId), action, targetUserId, ip address and a UTC
// timestamp. Entries are appended to the in-memory store for fast reads and
// persisted to the `audit_logs` table best-effort — an audit failure must
// never break the underlying request.
const { v4: uuidv4 } = require('uuid');
const { store } = require('../data/store');
const db = require('../db');

const MAX_IN_MEMORY_AUDIT_ENTRIES = 5000;

function clientIp(req) {
  if (!req) return '';
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || (req.connection && req.connection.remoteAddress) || '';
}

// Fire-and-forget audit write. Never throws.
async function writeAuditLog({ actorId = null, action, targetUserId = null, detail = '', ip = '' }) {
  const entry = {
    id: uuidv4(),
    adminId: actorId || null,
    action,
    targetUserId: targetUserId || null,
    detail,
    ipAddress: ip,
    createdAt: Date.now(),
  };
  store.auditLogs.push(entry);
  if (store.auditLogs.length > MAX_IN_MEMORY_AUDIT_ENTRIES) {
    store.auditLogs.splice(0, store.auditLogs.length - MAX_IN_MEMORY_AUDIT_ENTRIES);
  }
  try {
    if (db._db) await db.saveAuditLogDb(db._db, entry);
  } catch (e) {
    console.warn('audit log persist failed:', e.message);
  }
  return entry;
}

// Middleware factory: records the action once the response finishes so the
// log captures the real outcome (status code). Failures are logged too by
// default — attempted access to sensitive data is exactly what an audit
// trail exists for. Pass `{ logFailures: false }` to record successes only.
function auditTrail(action, resolveTarget = null, opts = {}) {
  const logFailures = opts.logFailures !== false;
  return function auditTrailMiddleware(req, res, next) {
    res.on('finish', () => {
      try {
        if (!logFailures && res.statusCode >= 400) return;
        const target = typeof resolveTarget === 'function' ? resolveTarget(req) : resolveTarget ?? req.params?.id ?? req.body?.userId ?? null;
        writeAuditLog({
          actorId: req.user?.id || null,
          action,
          targetUserId: target,
          ip: clientIp(req),
          detail: `${req.method} ${req.originalUrl} -> ${res.statusCode}`,
        });
      } catch (e) {
        console.warn('auditTrail error:', e.message);
      }
    });
    next();
  };
}

module.exports = { writeAuditLog, auditTrail, clientIp };
