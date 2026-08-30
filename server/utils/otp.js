// Real OTP delivery + verification primitives (PRD §2).
//
// Delivery providers are selected automatically from the environment:
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER  -> Twilio SMS
//   FAST2SMS_API_KEY                                             -> Fast2SMS (India DLT route)
//   MSG91_AUTH_KEY / MSG91_TEMPLATE_ID                           -> MSG91
//   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM    -> Nodemailer email OTP
//
// Security model:
//   - Codes are 6 random digits, delivered only via the provider.
//   - Only sha256(code + APP_SECRET) is persisted; raw codes never stored.
//   - Stored with an expiry (default 5 min); Mongo TTL index sweeps expired docs.
//   - Rate limits: max 3 sends per identifier per 10 minutes, and verification
//     locks after 5 wrong attempts.
//   - The static demo master code is accepted ONLY outside production.
const crypto = require('crypto');
const db = require('../db');
const { getJwtSecret, isProduction } = require('../secrets');

const OTP_TTL_MS = Math.max(5 * 60 * 1000, Math.min(Number(process.env.OTP_TTL_MS) || 5 * 60 * 1000, 10 * 60 * 1000)); // 5–10 min
const MAX_SENDS_PER_WINDOW = Number(process.env.OTP_MAX_SENDS) || 3;
const SEND_WINDOW_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

function hashCode(identifier, code) {
  // Shares the app secret so OTP hashes are not signed with a publicly known
  // constant. Throws in production when JWT_SECRET is unset — deliberate: a
  // guessable pepper would make stored code hashes trivially crackable.
  const secret = getJwtSecret();
  return crypto.createHash('sha256').update(`${String(identifier).toLowerCase()}|${code}|${secret}`).digest('hex');
}

/**
 * True when the static development master code may be accepted.
 *
 * Requires BOTH a non-production environment AND an explicit opt-in
 * (ALLOW_DEV_OTP=1). Previously `NODE_ENV !== 'production'` alone was enough,
 * which silently enabled a universal bypass on any deployment that forgot to
 * set NODE_ENV — for example a self-hosted Node process.
 */
function devMasterOtpEnabled() {
  return !isProduction() && process.env.ALLOW_DEV_OTP === '1';
}

/** The development master code, only meaningful when devMasterOtpEnabled(). */
function devMasterOtp() {
  return process.env.DEV_MASTER_OTP || '123456';
}

function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function activeProvider() {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) return 'twilio';
  if (process.env.FAST2SMS_API_KEY) return 'fast2sms';
  if (process.env.MSG91_AUTH_KEY) return 'msg91';
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return 'email';
  return null;
}

// Normalizes to E.164 (+91XXXXXXXXXX); assumes India for bare 10-digit numbers.
function normalizePhone(identifier) {
  let p = String(identifier).replace(/[^\d]/g, '');
  if (p.length === 10) return '+91' + p;
  if (p.length === 11 && p.startsWith('0')) return '+91' + p.slice(1);
  if (p.startsWith('91') && p.length === 12) return '+' + p;
  return '+' + p;
}

async function sendViaTwilio(identifier, code) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const to = identifier.includes('@') ? identifier : normalizePhone(identifier);
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const body = new URLSearchParams({ To: to, From: from, Body: `Your Shubh Sanjog Matrimony verification code is ${code}. Valid for 5 minutes.` });
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${auth}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Twilio send failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

async function sendViaFast2Sms(identifier, code) {
  if (identifier.includes('@')) throw new Error('Fast2SMS delivers SMS only — configure an email provider for email identifiers');
  const phone = normalizePhone(identifier).replace(/^\+/, '');
  const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: { authorization: process.env.FAST2SMS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ route: 'dlt', sender_id: process.env.FAST2SMS_SENDER_ID || 'FSTSMS', message: process.env.FAST2SMS_TEMPLATE_ID || '', variables_values: code, numbers: phone }),
  });
  if (!res.ok) throw new Error(`Fast2SMS send failed (${res.status})`);
  const json = await res.json().catch(() => ({}));
  if (json.return === false) throw new Error(`Fast2SMS rejected the send: ${JSON.stringify(json).slice(0, 200)}`);
}

async function sendViaMsg91(identifier, code) {
  if (identifier.includes('@')) throw new Error('MSG91 delivers SMS only — configure an email provider for email identifiers');
  const phone = normalizePhone(identifier).replace(/^\+/, '');
  const res = await fetch('https://control.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: { authkey: process.env.MSG91_AUTH_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_id: process.env.MSG91_TEMPLATE_ID,
      short_url: '0',
      recipients: [{ mobiles: phone, otp: code }],
    }),
  });
  if (!res.ok) throw new Error(`MSG91 send failed (${res.status})`);
  const json = await res.json().catch(() => ({}));
  if (json.type === 'error') throw new Error(`MSG91 rejected the send: ${JSON.stringify(json).slice(0, 200)}`);
}

async function sendViaEmail(identifier, code) {
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE || '') === 'true' || Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: identifier,
    subject: 'Shubh Sanjog Matrimony — your verification code',
    text: `Your verification code is ${code}. It expires in ${Math.round(OTP_TTL_MS / 60000)} minutes.`,
    html: `<p>Your <strong>Shubh Sanjog Matrimony</strong> verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px;">${code}</p><p>This code expires in ${Math.round(OTP_TTL_MS / 60000)} minutes. If you did not request it, please ignore this email.</p>`,
  });
}

// Returns { ok, provider } or throws with a safe user-facing message.
async function deliverOtp(identifier, code) {
  const provider = activeProvider();
  if (!provider) throw new Error('OTP delivery is not configured. Please contact support.');
  switch (provider) {
    case 'twilio': return sendViaTwilio(identifier, code);
    case 'fast2sms': return sendViaFast2Sms(identifier, code);
    case 'msg91': return sendViaMsg91(identifier, code);
    case 'email': return sendViaEmail(identifier, code);
    default: throw new Error('OTP delivery is not configured');
  }
}

/**
 * Create + deliver an OTP for the identifier.
 * Returns { ok:true, expiresInMs } on success, { ok:false, error } on rejection.
 */
async function issueOtp(identifierRaw) {
  const identifier = String(identifierRaw || '').trim().toLowerCase();

  // Rate limit (PRD §2): count recent sends straight from the database so the
  // limit survives restarts and applies across instances.
  try {
    const recent = await db.countRecentOtps(identifier, SEND_WINDOW_MS);
    if (recent >= MAX_SENDS_PER_WINDOW) {
      return { ok: false, error: 'Too many verification codes requested. Please wait 10 minutes and try again.' };
    }
  } catch (e) {
    console.warn('otp rate-limit check failed', e);
  }

  const code = generateCode();
  await db.saveOtp({ identifier, codeHash: hashCode(identifier, code), purpose: 'login', ttlMs: OTP_TTL_MS });

  const provider = activeProvider();
  if (!provider && !isProduction()) {
    // Development convenience: no provider configured — surface the code in the
    // server log and let the API response carry the master code.
    console.log(`[otp] DEV mode (no provider): code for ${identifier} is ${code}`);
    return { ok: true, expiresInMs: OTP_TTL_MS };
  }

  try {
    await deliverOtp(identifier, code);
  } catch (err) {
    console.error('OTP delivery failed:', err.message);
    return { ok: false, error: 'Could not send the verification code right now. Please try again shortly.' };
  }

  return { ok: true, expiresInMs: OTP_TTL_MS };
}

/**
 * Verify a submitted code. Returns { ok:true } or { ok:false, error }.
 * Consumes the code on success; locks after MAX_VERIFY_ATTEMPTS failures.
 */
async function verifyOtpCode(identifierRaw, codeSubmitted) {
  const identifier = String(identifierRaw || '').trim().toLowerCase();
  const record = await db.latestActiveOtp(identifier);
  if (!record) return { ok: false, error: 'No active verification code. Please request a new one.' };

  if (Number(record.attempts || 0) >= MAX_VERIFY_ATTEMPTS) {
    return { ok: false, error: 'Too many incorrect attempts. Please request a new verification code.' };
  }

  const matches = hashCode(identifier, String(codeSubmitted || '').trim()) === record.codeHash;
  if (!matches) {
    await db.incrementOtpAttempts(record.id ?? record._id);
    const left = MAX_VERIFY_ATTEMPTS - Number(record.attempts || 0) - 1;
    return { ok: false, error: left > 0 ? `Incorrect code. ${left} attempt(s) remaining.` : 'Too many incorrect attempts. Please request a new verification code.' };
  }

  await db.consumeOtp(record.id ?? record._id);
  return { ok: true };
}

module.exports = {
  issueOtp,
  verifyOtpCode,
  generateCode,
  hashCode,
  activeProvider,
  devMasterOtpEnabled,
  devMasterOtp,
  OTP_TTL_MS,
  MAX_SENDS_PER_WINDOW,
  MAX_VERIFY_ATTEMPTS,
};
