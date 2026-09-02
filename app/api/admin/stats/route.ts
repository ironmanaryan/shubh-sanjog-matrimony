import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase, verifyAdminToken } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/stats — alias for /api/admin/metrics
 *
 * Returns admin dashboard metrics statistics.
 * Requires valid admin JWT in Authorization: Bearer header.
 * Falls back to zeros if Supabase is not configured.
 */
export async function GET(request: NextRequest) {
  // Verify admin token
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return NextResponse.json(
      { error: 'Missing or invalid admin token', isAdmin: false },
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
    const nowMs = now.getTime();
    const sevenDaysAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgoMs = nowMs - 30 * 24 * 60 * 60 * 1000;

    // --- Customer & Membership Metrics ---
    const [totalCustomersResult, newRegistrations7dResult, newRegistrations30dResult, activeMembershipsResult] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }).gt('created_at', sevenDaysAgoMs),
      supabase.from('users').select('*', { count: 'exact', head: true }).gt('created_at', thirtyDaysAgoMs),
      supabase.from('memberships').select('*', { count: 'exact', head: true }).eq('active', true).gt('expires_at', nowMs),
    ]);

    const totalCustomers = totalCustomersResult.count ?? 0;
    const newRegistrations7d = newRegistrations7dResult.count ?? 0;
    const newRegistrations30d = newRegistrations30dResult.count ?? 0;
    const activeMemberships = activeMembershipsResult.count ?? 0;

    // --- Revenue & Payments ---
    const [paymentsResult] = await Promise.all([
      supabase.from('payments').select('amount, status, plan').eq('status', 'Approved'),
    ]);

    const approvedPayments = paymentsResult.data || [];
    let revenueMembership = 0;
    let revenueConsultation = 0;

    for (const p of approvedPayments) {
      const amount = Number(p.amount || 0);
      if (p.plan === 'membership') revenueMembership += amount;
      else if (p.plan === 'consultation') revenueConsultation += amount;
    }

    // --- Appointments ---
    const todayIso = now.toISOString().slice(0, 10);
    const [upcomingResult, completedResult, cancelledResult] = await Promise.all([
      supabase.from('appointments').select('*', { count: 'exact', head: true }).gte('date', todayIso).neq('status', 'Cancelled').neq('status', 'Completed'),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'Completed'),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'Cancelled'),
    ]);

    const matchmakingResult = await supabase.from('matrimonial_profiles').select('status');
    let approvedProfiles = 0;
    let totalReviewedProfiles = 0;
    for (const p of (matchmakingResult.data || [])) {
      const s = (p.status || '').toLowerCase();
      if (s === 'approved') approvedProfiles += 1;
      if (['approved', 'rejected'].includes(s)) totalReviewedProfiles += 1;
    }
    const profileApprovalRate = totalReviewedProfiles > 0 ? Math.round((approvedProfiles / totalReviewedProfiles) * 100) : 0;
    const matchActivityResult = await supabase.from('interest_requests').select('*', { count: 'exact', head: true });
    const matchActivity = matchActivityResult.count ?? 0;

    // --- Membership Expiry (next 7 days) ---
    const expiringMembershipsResult = await supabase.from('memberships').select('*', { count: 'exact', head: true }).eq('active', true).lte('expires_at', new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString());
    const expiringMemberships = expiringMembershipsResult.count ?? 0;

    const stats = {
      totalCustomers,
      newRegistrations: { last7Days: newRegistrations7d, last30Days: newRegistrations30d },
      activeMemberships,
      revenue: {
        membership: revenueMembership,
        consultation: revenueConsultation,
        total: revenueMembership + revenueConsultation,
        currency: 'INR',
      },
      appointments: {
        upcoming: upcomingResult.count ?? 0,
        completed: completedResult.count ?? 0,
        cancelled: cancelledResult.count ?? 0,
      },
      matchmaking: {
        profileApprovalRate,
        totalProfiles: (matchmakingResult.data || []).length,
        approvedProfiles,
        matchActivity,
      },
      membershipExpiry: { expiringIn7Days: expiringMemberships },
    };

    return NextResponse.json({
      isAdmin: true,
      source: 'supabase',
      stats,
    });
  } catch (error) {
    console.error('[/api/admin/stats] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', isAdmin: false },
      { status: 500 }
    );
  }
}