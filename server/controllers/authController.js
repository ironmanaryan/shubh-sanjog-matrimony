const { store, createUserIfMissing, normalizeEmail } = require('../data/store');
const db = require('../db');
const { signToken } = require('../middleware/auth');
const { matchesAdminIdentifier } = require('../middleware/rbac');
const otpService = require('../utils/otp');
const { isProduction } = require('../secrets');
const { writeAuditLog, clientIp } = require('../utils/audit');

// Supabase Auth — when configured, users are also synced to Supabase Auth.
// Resolved lazily: at module-load time the env may not be populated yet, and a
// client captured too early would be permanently null.
let _supabaseUtils;

function supabaseUtils() {
  if (_supabaseUtils === undefined) {
    try {
      _supabaseUtils = require('../utils/supabase');
    } catch {
      _supabaseUtils = null;
    }
  }
  return _supabaseUtils;
}

function supabaseAdmin() {
  const utils = supabaseUtils();
  if (!utils) return null;
  try {
    return utils.getSupabaseAdmin();
  } catch {
    return null;
  }
}

/** Verify a Supabase-issued access token and return the auth user, or null. */
async function verifySupabaseAccessToken(token) {
  const utils = supabaseUtils();
  if (!utils || !token) return null;
  try {
    return await utils.verifySupabaseToken(token);
  } catch {
    return null;
  }
}

/**
 * Resolve (or create) the local platform user for a verified Supabase identity.
 * `users.id` is the Supabase auth UUID so both systems share one identity.
 */
async function resolveUserFromSupabaseIdentity(authUser) {
  const identifier = String(
    authUser.email || authUser.phone || authUser.id || ''
  ).toLowerCase();
  if (!identifier) return null;

  const existing = store.users.get(authUser.id) || (db._db ? await db.getUserById(db._db, authUser.id).catch(() => null) : null);
  if (existing) return existing;

  const metadata = authUser.user_metadata || {};
  const fullName = metadata.full_name || metadata.name || '';

  // 🔔 Detect brand-new registration BEFORE createUserIfMissing adds the row,
  // otherwise the existence check would always return true.
  const { isExistingUser } = require('../data/store');
  const wasNewUser =
    !isExistingUser(authUser.email) && !isExistingUser(authUser.id) &&
    !isExistingUser(String(authUser.email || '').toLowerCase());

  const user = createUserIfMissing(authUser.id, {
    email: normalizeEmail(authUser.email),
    fullName: typeof fullName === 'string' && fullName.trim() ? fullName.trim() : undefined,
  });
  if (!user) return null;

  try {
    await db.createUser(db._db, user);
  } catch (e) {
    console.warn('db create user failed during session exchange', e && e.message ? e.message : e);
  }

  // New registrations are surfaced on the admin live-activity feed.
  // Fire-and-forget — a write failure must never break sign-in.
  writeAuditLog({
    actorId: user.id,
    action: 'REGISTER_USER',
    targetUserId: user.id,
    ip: '',
    detail: `signed in via Supabase — ${user.email || user.identifier || user.id}`,
  }).catch(() => {});

  // 🔔 Realtime notification — welcome new users on their very first sign-in.
  if (wasNewUser && user.role === 'customer') {
    try {
      const { notifyUser } = require('../utils/notify');
      notifyUser({
        toUserId: user.id,
        type: 'registration',
        payload: { email: user.email || null, fullName: user.fullName || null },
      }).catch(() => {});
    } catch (e) {
      /* notification must never break sign-in */
    }
  }

  return user;
}

/**
 * Make sure a signed-in identity has a `profiles` row.
 *
 * `middleware.ts` gates /customer on `profiles.is_completed`, so a user with no
 * row at all would be bounced to the onboarding form forever. The row is
 * created with `is_completed: false` — the form is what flips it to true.
 *
 * Runs with the service-role key so it is not blocked by RLS. Returns the
 * current completion state, or `null` when the table is unreachable.
 */
async function ensureProfileStub(authUser) {
  const client = supabaseAdmin();
  if (!client) return null;

  const meta = authUser.user_metadata || {};
  const fullName = meta.full_name || meta.name || '';
  const avatar = meta.avatar_url || meta.picture || null;
  const now = new Date().toISOString();

  try {
    const { data: existing } = await client
      .from('profiles')
      .select('is_completed')
      .or(`id.eq.${authUser.id},user_id.eq.${authUser.id}`)
      .maybeSingle();

    if (existing) {
      return existing.is_completed === true || existing.is_completed === 'true';
    }

    const { error } = await client.from('profiles').upsert(
      {
        id: authUser.id,
        user_id: authUser.id,
        email: authUser.email ?? null,
        full_name: fullName,
        avatar_url: avatar,
        photo_url: avatar,
        is_completed: false,
        created_at: now,
        updated_at: now,
      },
      { onConflict: 'id' }
    );
    if (error) console.warn('[auth] profile stub upsert failed:', error.message);
    return false;
  } catch (e) {
    console.warn('[auth] ensureProfileStub failed:', e && e.message ? e.message : e);
    return null;
  }
}

/**
 * POST /api/auth/supabase-session
 *
 * Exchanges a Supabase access token (from Google OAuth or email OTP) for the
 * platform's own JWT.
 *
 * Without this the two auth systems were disconnected: Google sign-in created a
 * Supabase session and set the SSR cookie, so `middleware.ts` let the user
 * through — but `localStorage.token` was never written, so every API call went
 * out with no Authorization header and came back 401. The user appeared "logged
 * in" while profile, matches and payments were all silently broken.
 */
async function supabaseSession(req, res) {
  try {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : (req.body && req.body.access_token);
    if (!token) {
      return res.status(400).json({ ok: false, error: 'Missing Supabase access token' });
    }

    const authUser = await verifySupabaseAccessToken(token);
    if (!authUser) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired Supabase session' });
    }

    const user = await resolveUserFromSupabaseIdentity(authUser);
    if (!user) {
      return res.status(400).json({ ok: false, error: 'Could not resolve user identity' });
    }
    if (user.deletedAt) {
      return res.status(403).json({ ok: false, error: 'Account no longer active' });
    }

    const identifier = String(user.identifier || authUser.email || authUser.id).toLowerCase();
    const role = user.role || (matchesAdminIdentifier(identifier) ? 'admin' : 'customer');
    const jwt = signToken({ userId: user.id, role, identifier });

    // Best-effort: give a brand-new sign-in the `profiles` row the middleware
    // and onboarding gate look for. `null` means "unknown" — callers should not
    // treat that as incomplete and risk bouncing the user in a loop.
    const profileCompleted = await ensureProfileStub(authUser);

    return res.json({
      ok: true,
      token: jwt,
      user: {
        id: user.id,
        identifier,
        email: authUser.email || user.email || null,
        fullName: user.fullName || authUser.user_metadata?.full_name || null,
        role,
      },
      profileCompleted,
    });
  } catch (err) {
    console.error('supabaseSession error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// Real OTP verification (PRD §2):
//   - codes are generated server-side and delivered via the configured
//     provider (Twilio / Fast2SMS / MSG91 / SMTP email) — see utils/otp.js
//   - hashed codes are stored with an expiry (Mongo TTL index in production)
//   - sends are rate-limited; verification locks after repeated failures
//   - the universal development master code is accepted ONLY outside
//     production so local/demo environments remain usable.
function isDev() {
  return !isProduction();
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
      result.ok && otpService.devMasterOtpEnabled()
        ? otpService.devMasterOtp()
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

    // Development master bypass — only outside production AND only when
    // explicitly opted in via ALLOW_DEV_OTP=1, so it can never mask production
    // delivery issues or become an accidental universal login key.
    const masterValid =
      otpService.devMasterOtpEnabled() && submitted === otpService.devMasterOtp();

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

    // persist to the database (Supabase PostgreSQL primary, SQLite fallback)
    try {
      if (user.id) {
        await db.createUser(db._db, user);
        // best-effort backfill of the optional email on repeat sign-ins
        if (user.email && db._db) {
          try {
            await db.backfillUserEmail(db._db, user.id, user.email);
          } catch {}
        }
        // Sync to Supabase Auth when configured (creates auth user if not exists)
        const client = supabaseAdmin();
        if (client) {
          try {
            const existing = client.auth.admin?.getUserById
              ? await client.auth.admin.getUserById(user.id).catch(() => null)
              : null;
            if (!existing?.data?.user) {
              const email = user.email || undefined;
              const phone =
                !user.email && String(user.identifier).match(/^\d/) ? String(user.identifier) : undefined;
              if (client.auth.admin?.createUser) {
                await client.auth.admin
                  .createUser({
                    email,
                    phone,
                    email_confirm: true,
                    phone_confirm: true,
                    user_metadata: {
                      full_name: user.fullName,
                      identifier: user.identifier,
                      role: user.role,
                    },
                  })
                  .catch(() => {});
              }
            }
          } catch (e) {
            console.warn('supabase sync failed (non-blocking):', e && e.message ? e.message : e);
          }
        }
      }
    } catch (e) {
      console.warn('db create user failed', e);
    }

    const role = user.role || (matchesAdminIdentifier(identifier) ? 'admin' : 'customer');
    const token = signToken({ userId: user.id, role, identifier: user.identifier });

    // If Supabase is configured, also mint a Supabase session token via sign-in
    // (fallback to JWT when Supabase unavailable so local preview still works).
    let supabaseToken = null;
    const client = supabaseAdmin();
    if (client && user.email) {
      try {
        const { data } = await client.auth
          .signInWithOtp({ email: user.email })
          .catch(() => ({ data: null }));
        if (data?.session?.access_token) supabaseToken = data.session.access_token;
      } catch {}
    }

    // return token and user (never the OTP internals)
    const safeUser = { ...user, role };
    return res.json({ ok: true, token: supabaseToken || token, supabaseToken, jwt: token, user: safeUser });
  } catch (err) {
    console.error('verifyOtp error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = { sendOtp, verifyOtp, supabaseSession };
