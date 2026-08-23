const { store, createUserIfMissing, normalizeEmail } = require('../data/store');
const db = require('../db');
const { signToken } = require('../middleware/auth');
const { matchesAdminIdentifier } = require('../middleware/rbac');
const otpService = require('../utils/otp');

// Real OTP verification (PRD §2):
//   - codes are generated server-side and delivered via the configured
//     provider (Twilio / Fast2SMS / MSG91 / SMTP email) — see utils/otp.js
//   - hashed codes are stored with an expiry (Mongo TTL index in production)
//   - sends are rate-limited; verification locks after repeated failures
//   - the universal development master code is accepted ONLY outside
//     production so local/demo environments remain usable.
function isDev() {
  return process.env.NODE_ENV !== 'production';
}

async function sendOtp(req, res) {
  try {
    const body = req.body || {};
    // `phone` is the canonical field; `identifier` kept for backward compat.
    const rawIdentifier = body.identifier || body.phone;
    if (!rawIdentifier || !String(rawIdentifier).trim()) {
      return res.status(400).json({ ok: false, error: 'identifier required (mobile number)' });
    }

    const identifier = String(rawIdentifier).trim().toLowerCase();
    const result = await otpService.issueOtp(identifier);

    // Development convenience: expose the master code ONLY when no real
    // provider is configured AND we are not in production. Never leaks codes
    // from the database — the master value comes from env/dev default.
    const demoOtp =
      result.ok && isDev() && !otpService.activeProvider()
        ? (process.env.DEV_MASTER_OTP || '123456')
        : undefined;

    if (!result.ok) {
      const status = /Too many/.test(result.error) ? 429 : 503;
      return res.status(status).json({ ok: false, error: result.error });
    }

    return res.json({
      ok: true,
      message: 'OTP sent',
      ...(demoOtp ? { demoOtp } : {}),
      expiresInMs: result.expiresInMs,
      provider: otpService.activeProvider() || 'dev',
    });
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

    const identifier = String(rawIdentifier).trim().toLowerCase();
    const submitted = String(code).trim();

    // Real verification first (hashed record lookup + attempt lockout).
    let verified = await otpService.verifyOtpCode(identifier, submitted);

    // Development master bypass — only outside production, only when no real
    // provider is configured, so it can never mask production delivery issues.
    const masterValid = isDev() && !otpService.activeProvider() && submitted === (process.env.DEV_MASTER_OTP || '123456');

    if (!verified.ok && !masterValid) {
      return res.status(400).json({ ok: false, error: verified.error });
    }

    // success - create or find user, issue JWT. Registration succeeds with just
    // the phone number; a missing email is stored as null without any
    // duplicate-key or validation failure.
    const user = createUserIfMissing(rawIdentifier, {
      email: normalizeEmail(body.email),
      fullName: typeof body.fullName === 'string' && body.fullName.trim() ? body.fullName.trim() : undefined,
    });
    if (!user) return res.status(400).json({ ok: false, error: 'identifier (mobile number) required' });

    // persist to the database (MongoDB in production)
    try {
      if (user.id) {
        await db.createUser(db._db, user);
        // best-effort backfill of the optional email on repeat sign-ins
        if (user.email) {
          if (db._mode === 'mongodb') {
            const { models } = db;
            await models().User.updateOne({ id: user.id }, { $set: { email: user.email } });
          }
        }
      }
    } catch (e) {
      console.warn('db create user failed', e);
    }

    const role = user.role || (matchesAdminIdentifier(identifier) ? 'admin' : 'customer');
    const token = signToken({ userId: user.id, role, identifier: user.identifier });

    // return token and user (never the OTP internals)
    const safeUser = { ...user, role };
    return res.json({ ok: true, token, user: safeUser });
  } catch (err) {
    console.error('verifyOtp error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = { sendOtp, verifyOtp };
