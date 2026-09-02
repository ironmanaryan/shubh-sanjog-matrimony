import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase, verifyAdminToken } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/me
 *
 * Returns the admin's identity if authenticated.
 * Returns { isAdmin: true } when a valid admin session or admin email exists.
 * This prevents unhandled 401 errors in the admin UI.
 */
export async function GET(request: NextRequest) {
  // Try to verify the admin token from the Authorization header
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (token) {
    const decoded = verifyAdminToken(token);
    if (decoded) {
      // Valid admin token — return admin identity
      return NextResponse.json({
        isAdmin: true,
        adminId: decoded.adminId,
        email: decoded.email,
        username: decoded.username,
      });
    }
  }

  // No valid token — return isAdmin: false so the UI can handle the unauthenticated state
  return NextResponse.json({ isAdmin: false }, { status: 200 });
}