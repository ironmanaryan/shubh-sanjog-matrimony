import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getAdminSupabase, signAdminToken } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const identifier = String(body.username || body.email || body.identifier || '').trim();
  const password = String(body.password || '');

  if (!identifier || !password) {
    return NextResponse.json({ ok: false, error: 'Username/email and password required' }, { status: 400 });
  }

  // Allow login via username OR email
  const isEmail = identifier.includes('@');
  const column = isEmail ? 'email' : 'username';

  const { data: admin, error } = await supabase
    .from('admin_users')
    .select('id, username, email, password_hash')
    .eq(column, isEmail ? identifier.toLowerCase() : identifier)
    .maybeSingle();

  // Fallback: try the other column if not found
  let resolvedAdmin = admin;
  let fetchError = error;
  if (!resolvedAdmin && !fetchError) {
    const otherColumn = isEmail ? 'username' : 'email';
    const { data: alt, error: altError } = await supabase
      .from('admin_users')
      .select('id, username, email, password_hash')
      .eq(otherColumn, isEmail ? identifier : identifier.toLowerCase())
      .maybeSingle();
    if (!altError) {
      resolvedAdmin = alt;
      fetchError = null;
    }
  }

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }
  if (!resolvedAdmin) {
    return NextResponse.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, resolvedAdmin.password_hash);
  if (!valid) {
    return NextResponse.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
  }

  const token = signAdminToken({
    adminId: resolvedAdmin.id,
    email: resolvedAdmin.email,
    username: resolvedAdmin.username,
  });

  return NextResponse.json({
    ok: true,
    token,
    admin: { id: resolvedAdmin.id, username: resolvedAdmin.username, email: resolvedAdmin.email },
  });
}
