import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase, verifyAdminToken } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /api/admin/metrics — real-time admin dashboard metrics.
 *
 * Returns a JSON document with every metric the dashboard renders. Each sub-
 * query is isolated in its own try/catch; if one query fails (table missing,
 * permissions, transient network error), only that metric returns `null` and
 * the dashboard shows "n/a" for it instead of failing the whole call.
 *
 * Auth: requires an admin JWT in the Authorization: Bearer header. If the
 * Supabase environment is not configured, falls back to a zero-shaped response
 * so the dashboard still loads (the operator can see "no data" rather than a
 * 500 error).
 *
 * Response shape:
 * {
 *   ok: true,
 *   generatedAt: <iso string>,
 *   source: 'supabase' | 'fallback-zeros',
 *   metrics: {
 *     totalCustomers: number,
 *     newRegistrations: { last7Days: number, last30Days: number },
 *     activeMemberships: number,
 *     revenue: { membership: number, consultation: number, total: number, currency: 'INR' },
 *     payments: { successful: number, failed: number, pending: number },
 *     appointments: { upcoming: number, completed: number, cancelled: number },
 *     matchmaking: {
 *       profileApprovalRate: number,    // 0..100
 *       totalProfiles: number,
 *       approvedProfiles: number,
 *       matchActivity: number,          // interest_requests count
 *     },
 *     membershipExpiry: { expiringIn7Days: number },
 *   },
 *   users: [ { id, identifier, email, full_name, role, created_at } ]   // top 50
 *   recentSignups: [ …same shape ]                                         // top 10, most recent
 * }
 */

function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function trySafe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[admin/metrics] ${label} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

const EMPTY_METRICS = {
  totalCustomers: 0,
  newRegistrations: { last7Days: 0, last30Days: 0 },
  activeMemberships: 0,
  revenue: { membership: 0, consultation: 0, total: 0, currency: 'INR' as const },
  payments: { successful: 0, failed: 0, pending: 0 },
  appointments: { upcoming: 0, completed: 0, cancelled: 0 },
  matchmaking: {
    profileApprovalRate: 0,
    totalProfiles: 0,
    approvedProfiles: 0,
    matchActivity: 0,
  },
  membershipExpiry: { expiringIn7Days: 0 },
};

export async function GET(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Missing bearer token' }, { status: 401 });
  }
  const decoded = verifyAdminToken(token);
  if (!decoded) {
    return NextResponse.json({ ok: false, error: 'Invalid or expired token' }, { status: 401 });
  }

  const supabase = getAdminSupabase();
  if (!supabase) {
    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      source: 'fallback-zeros',
      metrics: EMPTY_METRICS,
      users: [],
      recentSignups: [],
      warning: 'Supabase is not configured on this deploy; returning zeros.',
    });
  }

  const now = new Date();
  const nowMs = now.getTime();
  const sevenDaysAgoMs = nowMs - 7 * DAY_MS;
  const thirtyDaysAgoMs = nowMs - 30 * DAY_MS;
  const sevenDaysFromNowIso = new Date(nowMs + 7 * DAY_MS).toISOString();

  // ----- 1. Customer counts (server uses bigint epoch ms in created_at) -----
  const totalCustomers = (await trySafe('count users', async () => {
    const res = await supabase.from('users').select('*', { count: 'exact', head: true });
    return res.count ?? 0;
  })) ?? 0;

  const newLast7 = (await trySafe('count users 7d', async () => {
    const res = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gt('created_at', sevenDaysAgoMs);
    return res.count ?? 0;
  })) ?? 0;

  const newLast30 = (await trySafe('count users 30d', async () => {
    const res = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gt('created_at', thirtyDaysAgoMs);
    return res.count ?? 0;
  })) ?? 0;

  // ----- 2. Active memberships -----
  const activeMemberships = (await trySafe('count active memberships', async () => {
    const res = await supabase
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .eq('active', true)
      .gt('expires_at', nowMs);
    return res.count ?? 0;
  })) ?? 0;

  // ----- 3. Revenue & payment status -----
  // payments.plan is a tier name ('Gold','Premium',...). For this app those are
  // membership tiers; consultation payments go through the appointments table.
  // We sum approved payments as membership revenue (default) and surface a
  // separate metric for upcoming consultation appointments.
  const approvedPayments = (await trySafe('approved payments', async () => {
    const res = await supabase
      .from('payments')
      .select('amount, plan')
      .eq('status', 'Approved');
    if (res.error) throw res.error;
    return (res.data || []) as Array<{ amount: number | string; plan: string }>;
  })) ?? [];

  const paymentsAll = (await trySafe('payments by status', async () => {
    const res = await supabase.from('payments').select('status');
    if (res.error) throw res.error;
    return (res.data || []) as Array<{ status: string }>;
  })) ?? [];

  let successful = 0;
  let failed = 0;
  let pending = 0;
  for (const p of paymentsAll) {
    const s = (p.status || '').toLowerCase();
    if (s === 'approved') successful += 1;
    else if (s === 'rejected') failed += 1;
    else pending += 1;
  }

  let membershipRevenue = 0;
  for (const p of approvedPayments) {
    membershipRevenue += Number(p.amount || 0);
  }

  // Consultation revenue: appointments of type Consultation that have been
  // completed (we charge on completion). If you track a separate "consultation
  // payments" row, swap this query.
  const completedConsults = (await trySafe('completed consultations', async () => {
    const res = await supabase
      .from('appointments')
      .select('id, type')
      .eq('status', 'Completed')
      .ilike('type', 'Consultation');
    return (res.data || []) as Array<{ id: string }>;
  })) ?? [];
  // Heuristic: each consultation is ₹999 (matches the inline consulting fee
  // on the homepage). Replace with a real column if/when it exists.
  const CONSULTATION_FEE = 999;
  const consultationRevenue = completedConsults.length * CONSULTATION_FEE;

  // ----- 4. Appointments -----
  const todayIso = now.toISOString().slice(0, 10);
  const upcomingAppointments = (await trySafe('upcoming appointments', async () => {
    const res = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .gte('date', todayIso)
      .neq('status', 'Cancelled')
      .neq('status', 'Completed');
    return res.count ?? 0;
  })) ?? 0;

  const completedMeetings = (await trySafe('completed meetings', async () => {
    const res = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Completed');
    return res.count ?? 0;
  })) ?? 0;

  const cancelledAppointments = (await trySafe('cancelled appointments', async () => {
    const res = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Cancelled');
    return res.count ?? 0;
  })) ?? 0;

  // ----- 5. Profile approval rate & match activity -----
  const profilesByStatus = (await trySafe('profiles by status', async () => {
    const res = await supabase.from('matrimonial_profiles').select('status');
    return (res.data || []) as Array<{ status: string }>;
  })) ?? [];

  let approvedProfiles = 0;
  let totalReviewedProfiles = 0;
  for (const p of profilesByStatus) {
    const s = (p.status || '').toLowerCase();
    if (s === 'approved') approvedProfiles += 1;
    if (['approved', 'rejected'].includes(s)) totalReviewedProfiles += 1;
  }
  const profileApprovalRate =
    totalReviewedProfiles > 0 ? Math.round((approvedProfiles / totalReviewedProfiles) * 100) : 0;

  const matchActivity = (await trySafe('interest requests count', async () => {
    const res = await supabase.from('interest_requests').select('*', { count: 'exact', head: true });
    return res.count ?? 0;
  })) ?? 0;

  // ----- 6. Membership expiry (next 7 days) -----
  const expiringMemberships = (await trySafe('expiring memberships', async () => {
    const res = await supabase
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .eq('active', true)
      .gt('expires_at', nowMs)
      // Supabase JS: lte() against ISO works on bigint columns cast; use ms int
      .lte('expires_at', sevenDaysFromNowIso);
    return res.count ?? 0;
  })) ?? 0;

  // ----- 7. Top users (for the dashboard user list + CSV export) -----
  const usersTop = (await trySafe('top users', async () => {
    const res = await supabase
      .from('users')
      .select('id, identifier, email, full_name, role, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (res.error) throw res.error;
    return (res.data || []) as Array<{
      id: string;
      identifier: string;
      email: string | null;
      full_name: string | null;
      role: string;
      created_at: number | string;
    }>;
  })) ?? [];

  const recentSignups = (await trySafe('recent signups', async () => {
    const res = await supabase
      .from('users')
      .select('id, identifier, email, full_name, role, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    return (res.data || []) as typeof usersTop;
  })) ?? [];

  const metrics = {
    totalCustomers: Number(totalCustomers) || 0,
    newRegistrations: {
      last7Days: Number(newLast7) || 0,
      last30Days: Number(newLast30) || 0,
    },
    activeMemberships: Number(activeMemberships) || 0,
    revenue: {
      membership: Number(membershipRevenue) || 0,
      consultation: Number(consultationRevenue) || 0,
      total: (Number(membershipRevenue) || 0) + (Number(consultationRevenue) || 0),
      currency: 'INR' as const,
    },
    payments: {
      successful: Number(successful) || 0,
      failed: Number(failed) || 0,
      pending: Number(pending) || 0,
    },
    appointments: {
      upcoming: Number(upcomingAppointments) || 0,
      completed: Number(completedMeetings) || 0,
      cancelled: Number(cancelledAppointments) || 0,
    },
    matchmaking: {
      profileApprovalRate: Number(profileApprovalRate) || 0,
      totalProfiles: profilesByStatus.length,
      approvedProfiles: Number(approvedProfiles) || 0,
      matchActivity: Number(matchActivity) || 0,
    },
    membershipExpiry: {
      expiringIn7Days: Number(expiringMemberships) || 0,
    },
  };

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    source: 'supabase',
    metrics,
    users: usersTop,
    recentSignups,
  });
}
