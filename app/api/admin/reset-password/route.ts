import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getAdminSupabase } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const otp = String(body.otp || body.otp_code || '').trim();
  const newPassword = String(body.newPassword || body.password || '');

  if (!email || !otp || !newPassword) {
    return NextResponse.json({ ok: false, error: 'Email, OTP and new password required' }, { status: 400 });
  }
  if (!/^\d{6}$/.test(otp)) {
    return NextResponse.json({ ok: false, error: 'OTP must be 6 digits' }, { status: 400 });
  }
  if (newPassword.length < 8) {
    // matches /api/admin/credentials so the reset path can't bypass the higher bar
    return NextResponse.json({ ok: false, error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const { data: otpRow, error: otpError } = await supabase
    .from('admin_otps')
    .select('id, email, otp_code, expires_at, is_used')
    .eq('email', email)
    .eq('otp_code', otp)
    .eq('is_used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (otpError) {
    return NextResponse.json({ ok: false, error: otpError.message }, { status: 500 });
  }
  if (!otpRow) {
    return NextResponse.json({ ok: false, error: 'Invalid OTP' }, { status: 400 });
  }
  if (new Date(otpRow.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: 'OTP has expired. Please request a new one.' }, { status: 400 });
  }

  const password_hash = await bcrypt.hash(newPassword, 10);

  const { error: updateError } = await supabase
    .from('admin_users')
    .update({ password_hash })
    .eq('email', email);

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  await supabase.from('admin_otps').update({ is_used: true }).eq('id', otpRow.id);

  return NextResponse.json({ ok: true, message: 'Password reset successful' });
}
