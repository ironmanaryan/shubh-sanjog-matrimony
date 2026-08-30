// HMAC-signed, short-lived URLs for private files (scope PDF §30/§31).
// Documents and receipts are never exposed at public static paths — access is
// granted only via a signed token that encodes the file id, the grantee and an
// expiry. The signature uses the same secret as JWTs.
const crypto = require('crypto');
const { getJwtSecret } = require('../secrets');

// Short-lived signed access (privacy spec §30): documents are never public —
// a signed URL grants at most 15 minutes of access, configurable via env.
const DEFAULT_TTL_SECONDS = Number(process.env.SIGNED_URL_TTL_SECONDS || 900);

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function hmac(data) {
  return crypto.createHmac('sha256', getJwtSecret()).update(data).digest('base64url');
}

// payload: plain object (kept small — docId, userId, purpose)
function signPayload(payload) {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + DEFAULT_TTL_SECONDS * 1000 }));
  return `${body}.${hmac(body)}`;
}

// Returns the payload when the token is valid and unexpired, else null.
function verifyPayload(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  try {
    const expected = hmac(body);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Number(payload.exp) < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = { signPayload, verifyPayload, DEFAULT_TTL_SECONDS };
