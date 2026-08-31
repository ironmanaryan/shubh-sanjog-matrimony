import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getAdminSupabase, verifyAdminToken, signAdminToken } from '../_lib';

/**
 * /api/admin/credentials — manage the signed-in master admin account.
 *
 *   GET    → read the current account (no secrets returned)
 *   PATCH  → change username and/or password
 *   DELETE → permanently delete the account (resets the app to first-run setup)
 *
 * Every verb requires a valid admin JWT (Bearer). Mutating verbs additionally
 * require the caller's CURRENT password, so a stolen token alone cannot change
 * or destroy the account. Deletion further requires an explicit confirmation
 * string so a stray request can't wipe the admin.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIN_USERNAME = 3;
const MIN_PASSWORD = 8;

function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

type AdminRow = {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  created_at: string;
};

/**
 * Authenticates the caller and loads their admin row.
 * On success returns `{ supabase, admin }`; on failure returns `{ error }`
 * holding a ready-to-return NextResponse.
 */
async function authenticate(request: NextRequest) {
  const supabase = getAdminSupabase();
  if (!supabase) {
    return { error: NextResponse.json({ ok: false, error: 'Supabase is not configured' }, { status: 500 }) } as const;
  }

  const token = getBearerToken(request);
  if (!token) {
    return { error: NextResponse.json({ ok: false, error: 'Missing bearer token' }, { status: 401 }) } as const;
  }

  const decoded = verifyAdminToken(token);
  if (!decoded) {
    return { error: NextResponse.json({ ok: false, error: 'Invalid or expired token' }, { status: 401 }) } as const;
  }

  const { data: admin, error } = await supabase
    .from('admin_users')
    .select('id, username, email, password_hash, created_at')
    .eq('id', decoded.adminId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ ok: false, error: error.message }, { status: 500 }) } as const;
  }
  if (!admin) {
    return { error: NextResponse.json({ ok: false, error: 'Admin account no longer exists' }, { status: 404 }) } as const;
  }

  return { supabase, admin: admin as AdminRow } as const;
}

/** Reads the current account. */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;

  const { admin } = auth;
  return NextResponse.json({
    ok: true,
    admin: { id: admin.id, username: admin.username, email: admin.email, created_at: admin.created_at },
  });
}

/** Updates username and/or password. Requires the current password. */
export async function PATCH(request: NextRequest) {
  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;

  const { supabase, admin } = auth;
  const body = await request.json().catch(() => ({}));

  const currentPassword = String(body.currentPassword || '');
  const nextUsername = String(body.username ?? body.newUsername ?? '').trim();
  const nextPassword = String(body.password ?? body.newPassword ?? '');
  const nextEmail = String(body.email ?? body.newEmail ?? '').trim().toLowerCase();

  // A stolen token must not be enough — prove knowledge of the current password.
  if (!currentPassword) {
    return NextResponse.json({ ok: false, error: 'Current password is required' }, { status: 401 });
  }
  const currentValid = await bcrypt.compare(currentPassword, admin.password_hash);
  if (!currentValid) {
    return NextResponse.json({ ok: false, error: 'Current password is incorrect' }, { status: 401 });
  }

  if (!nextUsername && !nextPassword && !nextEmail) {
    return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 });
  }

  const updates: Record<string, string> = {};

  if (nextUsername && nextUsername !== admin.username) {
    if (nextUsername.length < MIN_USERNAME) {
      return NextResponse.json(
        { ok: false, error: `Username must be at least ${MIN_USERNAME} characters` },
        { status: 400 }
      );
    }
    updates.username = nextUsername;
  }

  if (nextEmail && nextEmail !== admin.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      return NextResponse.json({ ok: false, error: 'Enter a valid email address' }, { status: 400 });
    }
    updates.email = nextEmail;
  }

  if (nextPassword) {
    if (nextPassword.length < MIN_PASSWORD) {
      return NextResponse.json(
        { ok: false, error: `Password must be at least ${MIN_PASSWORD} characters` },
        { status: 400 }
      );
    }
    const reused = await bcrypt.compare(nextPassword, admin.password_hash);
    if (reused) {
      return NextResponse.json(
        { ok: false, error: 'New password must be different from the current password' },
        { status: 400 }
      );
    }
    updates.password_hash = await bcrypt.hash(nextPassword, 10);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'No changes to apply' }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabase
    .from('admin_users')
    .update(updates)
    .eq('id', admin.id)
    .select('id, username, email, created_at')
    .single();

  if (updateError) {
    if (updateError.code === '23505') {
      return NextResponse.json({ ok: false, error: 'That username or email is already taken' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  // Re-issue the token so it carries the new username/email rather than stale claims.
  const token = signAdminToken({
    adminId: updated.id,
    email: updated.email,
    username: updated.username,
  });

  return NextResponse.json({ ok: true, admin: updated, token });
}

export async function PUT(request: NextRequest) {
  return PATCH(request);
}

export async function POST(request: NextRequest) {
  return PATCH(request);
}

/**
 * Permanently deletes the admin account and any outstanding OTPs.
 * Requires the current password AND `confirm: "DELETE"`.
 */
export async function DELETE(request: NextRequest) {
  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;

  const { supabase, admin } = auth;
  const body = await request.json().catch(() => ({}));

  const currentPassword = String(body.currentPassword || '');
  const confirm = String(body.confirm || '').trim();

  if (confirm !== 'DELETE') {
    return NextResponse.json(
      { ok: false, error: 'Type DELETE to confirm account removal' },
      { status: 400 }
    );
  }

  if (!currentPassword) {
    return NextResponse.json({ ok: false, error: 'Current password is required' }, { status: 401 });
  }
  const currentValid = await bcrypt.compare(currentPassword, admin.password_hash);
  if (!currentValid) {
    return NextResponse.json({ ok: false, error: 'Current password is incorrect' }, { status: 401 });
  }

  // Clear password-reset OTPs first so nothing dangles after the account is gone.
  const { error: otpError } = await supabase.from('admin_otps').delete().eq('email', admin.email);
  if (otpError) {
    console.warn('[admin/credentials] could not clear OTPs:', otpError.message);
  }

  const { error } = await supabase.from('admin_users').delete().eq('id', admin.id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: 'Admin account deleted. The app is reset to first-time setup.',
  });
}
