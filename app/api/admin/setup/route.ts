import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getAdminSupabase } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ exists: false, error: 'Supabase not configured' }, { status: 500 });

  const { data, error, count } = await supabase.from('admin_users').select('id', { count: 'exact', head: true });
  if (error) {
    return NextResponse.json({ exists: false, error: error.message }, { status: 500 });
  }
  const exists = (count ?? 0) > 0;
  return NextResponse.json({ exists, count: count ?? 0 });
}

export async function POST(request: NextRequest) {
  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const username = String(body.username || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  const MIN_USERNAME = 3;
  const MIN_PASSWORD = 8; // matches /api/admin/credentials so callers can't bypass the higher bar via setup
  if (!username || username.length < MIN_USERNAME) {
    return NextResponse.json({ ok: false, error: `Username must be at least ${MIN_USERNAME} characters` }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Valid email required' }, { status: 400 });
  }
  if (!password || password.length < MIN_PASSWORD) {
    return NextResponse.json({ ok: false, error: `Password must be at least ${MIN_PASSWORD} characters` }, { status: 400 });
  }

  // Block re-setup if admin already exists
  const { count, error: countError } = await supabase.from('admin_users').select('id', { count: 'exact', head: true });
  if (countError) {
    return NextResponse.json({ ok: false, error: countError.message }, { status: 500 });
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json({ ok: false, error: 'Admin already exists. Setup is blocked.' }, { status: 403 });
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from('admin_users')
    .insert({ username, email, password_hash })
    .select('id, username, email, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ ok: false, error: 'Username or email already exists' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, admin: data });
}
