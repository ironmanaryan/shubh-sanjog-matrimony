import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase, verifyAdminToken } from '../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/appointments/status
 * 
 * Returns appointment status counts for the admin dashboard.
 * Requires valid admin JWT in Authorization: Bearer header.
 * Uses Supabase Service Role client for database access.
 */
export async function GET(request: NextRequest) {
  // Verify admin token
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return NextResponse.json(
      { error: 'Missing admin token', isAdmin: false },
      { status: 401 }
    );
  }

  const decoded = verifyAdminToken(token);
  if (!decoded) {
    return NextResponse.json(
      { error: 'Invalid or expired admin token', isAdmin: false },
      { status: 401 }
    );
  }

  // Use Service Role client for database operations (bypasses client-side cookies)
  const supabase = getAdminSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase not configured', isAdmin: false },
      { status: 503 }
    );
  }

  try {
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);

    // Get appointment status counts
    const [upcomingResult, completedResult, cancelledResult] = await Promise.all([
      supabase.from('appointments').select('*', { count: 'exact', head: true }).gte('date', todayIso).neq('status', 'Cancelled').neq('status', 'Completed'),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'Completed'),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'Cancelled'),
    ]);

    // Also get past/draft appointments count
    const draftResult = await supabase.from('appointments').select('*', { count: 'exact', head: true }).lt('date', todayIso).or('status=eq.draft,status=eq.pending');

    const status = {
      upcoming: upcomingResult.count ?? 0,
      completed: completedResult.count ?? 0,
      cancelled: cancelledResult.count ?? 0,
      draft: draftResult.count ?? 0,
    };

    return NextResponse.json({
      isAdmin: true,
      status,
    });
  } catch (error) {
    console.error('[/api/admin/appointments/status] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', isAdmin: false },
      { status: 500 }
    );
  }
}