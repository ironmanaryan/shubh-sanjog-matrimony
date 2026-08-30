// Central secret resolution.
//
// Every signing path in the API derives its key from JWT_SECRET. Previously each
// module had its own fallback ('dev-secret-please-change'), which meant a
// production deployment with no JWT_SECRET would silently sign tokens with a
// publicly known constant — anyone could mint an admin token.
//
// Rules:
//   - JWT_SECRET set            -> use it everywhere
//   - production, unset         -> throw when a signing operation is attempted
//   - development, unset        -> derive a stable dev key and warn once

let _warned = false;

function isProduction() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}

function getJwtSecret() {
  const configured = (process.env.JWT_SECRET || '').trim();
  if (configured) return configured;

  if (isProduction()) {
    throw new Error(
      'JWT_SECRET is not set. Refusing to sign or verify tokens with the insecure development default. ' +
        'Set JWT_SECRET in your deployment environment.'
    );
  }

  if (!_warned) {
    _warned = true;
    console.warn(
      '[secrets] JWT_SECRET is not set — using an insecure development key. Never do this in production.'
    );
  }
  return 'dev-secret-please-change';
}

module.exports = { getJwtSecret, isProduction };
