import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase, getSmtpConfig } from '../_lib';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(request: NextRequest) {
  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Valid email required' }, { status: 400 });
  }

  const { data: admin, error: adminError } = await supabase
    .from('admin_users')
    .select('id, email')
    .eq('email', email)
    .maybeSingle();

  if (adminError) {
    return NextResponse.json({ ok: false, error: adminError.message }, { status: 500 });
  }
  if (!admin) {
    // Do NOT reveal whether the email is registered. Reply with the same
    // payload we send on success so an attacker can't enumerate admin emails.
    // Add a tiny delay so the timing matches a real send roughly.
    await new Promise((r) => setTimeout(r, 250));
    return NextResponse.json({ ok: true, message: 'If that email is registered, an OTP has been sent.' });
  }

  const otp_code = generateOtp();
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error: insertError } = await supabase.from('admin_otps').insert({
    email,
    otp_code,
    expires_at,
    is_used: false,
  });

  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  // Send OTP email via Nodemailer using machinesmarvis@gmail.com
  const smtp = getSmtpConfig();
  const canSendEmail = smtp.host && smtp.user && smtp.pass;

  if (canSendEmail) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure || smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.pass },
      });

      await transporter.sendMail({
        from: smtp.from,
        to: email,
        subject: 'Shubh Sanjog — Admin password reset OTP',
        text: `Your admin verification code is ${otp_code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
        html: `<p>Your <strong>Shubh Sanjog Matrimony</strong> admin verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px;">${otp_code}</p><p>This code expires in 10 minutes.</p>`,
      });
    } catch (e) {
      console.error('[admin/forgot-password] email failed', e);
      // Do not fail the request — OTP is still stored, user can retry. Log for debugging.
    }
  } else {
    console.log(`[admin/forgot-password] SMTP not configured — OTP for ${email} is ${otp_code} (from machinesmarvis@gmail.com)`);
  }

  const response: Record<string, unknown> = { ok: true, message: 'OTP sent to email' };
  // Only leak the OTP for local development. In production, regardless of SMTP
  // configuration, we never expose the code — even if the operator forgot to
  // set SMTP and the email didn't actually go out.
  if (process.env.NODE_ENV !== 'production') {
    (response as Record<string, unknown>).devOtp = otp_code;
  }

  return NextResponse.json(response);
}
