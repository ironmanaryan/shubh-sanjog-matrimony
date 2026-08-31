import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

function stripQuotes(v: string | undefined): string {
  if (!v) return '';
  const t = String(v).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1).trim();
  return t;
}

export function getAdminSupabase() {
  const url = stripQuotes(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '');
  const serviceKey = stripQuotes(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      ''
  );
  const anonKey = stripQuotes(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '');
  const key = serviceKey || anonKey;
  if (!url || !key || key.includes('...') || !url.startsWith('https://')) {
    return null;
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getJwtSecret(): string {
  const configured = (process.env.JWT_SECRET || '').trim();
  if (configured) return configured;
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  if (isProd) {
    throw new Error('JWT_SECRET is not set');
  }
  return 'dev-secret-please-change';
}

export function signAdminToken(payload: { adminId: string; email: string; username: string }) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

export function verifyAdminToken(token: string): { adminId: string; email: string; username: string } | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { adminId: string; email: string; username: string };
    if (!decoded?.adminId) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function getSmtpConfig() {
  return {
    host: process.env.SMTP_HOST || process.env.EMAIL_HOST || '',
    port: Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587),
    user: process.env.SMTP_USER || process.env.EMAIL_USER || process.env.SMTP_USERNAME || '',
    pass: process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || process.env.EMAIL_FROM || 'machinesmarvis@gmail.com',
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
  };
}
