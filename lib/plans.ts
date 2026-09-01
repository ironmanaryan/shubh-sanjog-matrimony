import { cache } from 'react';

// Server-only reader for the membership_plans — Supabase PostgreSQL primary,
// SQLite fallback, seed catalog as last resort. Single source of truth is
// Supabase `membership_plans` table (mirrors Express API).
export type MembershipPlan = {
  tier: string;
  name: string;
  price: number;
  durationDays: number;
  meetingsAllowed: number;
  profilesMin: number;
  profilesMax: number;
  priorityAssistance: boolean;
  description: string;
  features: string[];
  popular: boolean;
};

// Local SQLite fallback removed for Vercel serverless: Supabase is sole
// primary DB. Previous `server/data/database.sqlite` via `sqlite`/`sqlite3`
// required native node-gyp compilation which bloats/hangs Vercel deploys.
// `server/db-sqlite.js` is retained for local dev only and is never bundled
// into the Next.js frontend (devDependencies excluded from Vercel install).

// Stale-while-revalidate cache. Membership plans almost never change mid-day;
// caching for 60s drops the per-request Supabase round trip while keeping
// edits visible within a minute. Next.js's `revalidate` doesn't help here
// because app/page.tsx is `dynamic = 'force-dynamic'` and a force-dynamic
// route bypasses the data cache.
type PlanCacheEntry = { plans: MembershipPlan[]; cachedAt: number };
const planCache: PlanCacheEntry = { plans: [], cachedAt: 0 };
const PLAN_TTL_MS = 60_000;

// dedupe repeated getMembershipPlans() calls within a single render
export const getMembershipPlans = cache(async (): Promise<MembershipPlan[]> => {
  const now = Date.now();
  if (planCache.plans.length > 0 && now - planCache.cachedAt < PLAN_TTL_MS) {
    return planCache.plans;
  }
  const fresh = await readPlansFromSource();
  if (fresh.length > 0) {
    planCache.plans = fresh;
    planCache.cachedAt = now;
  }
  return fresh.length > 0 ? fresh : planCache.plans;
});

async function readPlansFromSource(): Promise<MembershipPlan[]> {
  // 1) Supabase PostgreSQL (primary) — uses NEXT_PUBLIC_SUPABASE_URL
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase
        .from('membership_plans')
        .select('tier, name, price, duration_days, meetings_allowed, profiles_min, profiles_max, priority_assistance, description, features, popular')
        .eq('active', true)
        .order('sort_order', { ascending: true });
      if (!error && data && data.length > 0) {
        return data.map((row: Record<string, unknown>) => ({
          tier: String(row.tier),
          name: String(row.name),
          price: Number(row.price),
          durationDays: Number((row as Record<string, unknown>).duration_days ?? (row as Record<string, unknown>).durationDays),
          meetingsAllowed: Number((row as Record<string, unknown>).meetings_allowed ?? (row as Record<string, unknown>).meetingsAllowed),
          profilesMin: Number((row as Record<string, unknown>).profiles_min ?? (row as Record<string, unknown>).profilesMin ?? 0),
          profilesMax: Number((row as Record<string, unknown>).profiles_max ?? (row as Record<string, unknown>).profilesMax ?? 0),
          priorityAssistance: Boolean((row as Record<string, unknown>).priority_assistance ?? (row as Record<string, unknown>).priorityAssistance),
          description: String(row.description || ''),
          features: typeof row.features === 'string' ? JSON.parse(row.features as string) : (row.features as string[]) || [],
          popular: Boolean(row.popular),
        }));
      }
    }
  } catch {
    // fall through to seed catalog
  }

  // 2) Seed catalog fallback so public page always renders contract tiers
  // (SQLite fallback removed - Supabase primary, no native sqlite3 on Vercel)
  const { MEMBERSHIP_PACKAGES } = await import('../server/data/plan-catalog');
  return Object.values(MEMBERSHIP_PACKAGES).map((plan) => ({
    tier: plan.tier,
    name: plan.name,
    price: plan.price,
    durationDays: plan.durationDays,
    meetingsAllowed: plan.meetingsAllowed,
    profilesMin: plan.profilesMin,
    profilesMax: plan.profilesMax,
    priorityAssistance: plan.priorityAssistance,
    description: plan.description,
    features: plan.features,
    popular: plan.popular,
  }));
}
