const { store, createUserIfMissing, normalizeEmail } = require('../data/store');
const { signToken } = require('../middleware/auth');
const { matchesAdminIdentifier } = require('../middleware/rbac');
const db = require('../db');

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Universal development master OTP. Accepted for ANY identifier while the API
// runs outside production, so admins and customers can always get in even if
// SMS/email delivery is not configured. Disabled automatically in production.
const DEV_MASTER_OTP = '123456';
const isDev = () => process.env.NODE_ENV !== 'production';

function normalizeIdentifier(identifier) {
  return String(identifier || '').trim().toLowerCase();
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendOtp(req, res) {
  try {
    const body = req.body || {};
    // `phone` is the canonical field; `identifier` kept for backward compat.
    const rawIdentifier = body.identifier || body.phone;
    if (!rawIdentifier || !String(rawIdentifier).trim()) {
      return res.status(400).json({ ok: false, error: 'identifier required (mobile number)' });
    }

    const normalized = normalizeIdentifier(rawIdentifier);
    const code = generateOtp();
    const expiresAt = Date.now() + OTP_TTL_MS;

    // Store under BOTH the normalized and the raw identifier so verification
    // succeeds regardless of casing/whitespace differences between calls.
    store.otps.set(normalized, { code, expiresAt });
    if (String(rawIdentifier).trim() !== normalized) {
      store.otps.set(String(rawIdentifier).trim(), { code, expiresAt });
    }

    // In production send via SMS / Email. Here we return the code in response for demo.
    return res.json({ ok: true, message: 'OTP generated (demo)', demoOtp: code, expiresAt });
  } catch (err) {
    console.error('sendOtp error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

async function verifyOtp(req, res) {
  try {
    const body = req.body || {};
    // `phone` is the canonical identifier; email is strictly optional metadata
    // collected at registration and never required to sign in.
    const rawIdentifier = body.identifier || body.phone;
    const code = body.code;
    if (!rawIdentifier || !String(rawIdentifier).trim() || !code) {
      return res.status(400).json({ ok: false, error: 'identifier (mobile number) and code required' });
    }
    const email = normalizeEmail(body.email); // empty/undefined -> null
    const fullName = typeof body.fullName === 'string' && body.fullName.trim() ? body.fullName.trim() : undefined;

    const normalized = normalizeIdentifier(rawIdentifier);
    const submitted = String(code).trim();

    const record =
      store.otps.get(normalized) ||
      store.otps.get(String(rawIdentifier).trim()) ||
      null;

    // Development master bypass — works even if the OTP record was lost
    // (e.g., server restarted between send and verify).
    const devMasterValid = isDev() && submitted === DEV_MASTER_OTP;

    if (!devMasterValid) {
      if (!record) return res.status(400).json({ ok: false, error: 'No OTP requested for this identifier' });
      if (Date.now() > record.expiresAt) {
        store.otps.delete(normalized);
        store.otps.delete(String(rawIdentifier).trim());
        return res.status(400).json({ ok: false, error: 'OTP expired' });
      }
      if (record.code !== submitted) return res.status(400).json({ ok: false, error: 'Invalid OTP' });
    }

    // success - create or find user, issue JWT. Registration succeeds with just
    // the phone number; a missing email is stored as null without any
    // duplicate-key or validation failure.
    const user = createUserIfMissing(rawIdentifier, { email, fullName });
    if (!user) return res.status(400).json({ ok: false, error: 'identifier (mobile number) required' });

    // persist to sqlite (if available)
    try {
      if (db._db) {
        await db.createUser(db._db, user);
        // best-effort backfill of the optional email on repeat sign-ins
        if (user.email) {
          await db._db.run(`UPDATE users SET email = COALESCE(email, ?) WHERE id = ?`, [user.email, user.id]);
        }
      }
    } catch (e) {
      console.warn('db create user failed', e);
    }

    const role = user.role || (matchesAdminIdentifier(normalized) ? 'admin' : 'customer');
    const token = signToken({ userId: user.id, role, identifier: user.identifier });

    // cleanup
    store.otps.delete(normalized);
    store.otps.delete(String(rawIdentifier).trim());

    // return token and user
    const safeUser = { ...user, role };
    return res.json({ ok: true, token, user: safeUser });
  } catch (err) {
    console.error('verifyOtp error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = { sendOtp, verifyOtp };
