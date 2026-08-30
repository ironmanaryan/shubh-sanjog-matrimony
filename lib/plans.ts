import path from 'path';

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

const DB_PATH = path.join(process.cwd(), 'server', 'data', 'database.sqlite');

export async function getMembershipPlans(): Promise<MembershipPlan[]> {
  // 1) Supabase PostgreSQL (primary) — uses NEXT_PUBLIC_SUPABASE_URL
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase
        .from('membership_plans')
        .select('*')
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
    // fall through to SQLite
  }

  // 2) SQLite fallback (local dev)
  try {
    const { open } = await import('sqlite');
    const sqlite3 = await import('sqlite3');
    const db = await open({ filename: DB_PATH, driver: sqlite3.default.Database });
    try {
      const rows = await db.all(
        `SELECT * FROM membership_plans WHERE active = 1 ORDER BY sortOrder ASC`
      );
      return rows.map((row) => ({
        tier: row.tier,
        name: row.name,
        price: Number(row.price),
        durationDays: Number(row.durationDays),
        meetingsAllowed: Number(row.meetingsAllowed),
        profilesMin: Number(row.profilesMin || 0),
        profilesMax: Number(row.profilesMax || 0),
        priorityAssistance: row.priorityAssistance === 1,
        description: row.description || '',
        features: row.features ? JSON.parse(row.features) : [],
        popular: row.popular === 1,
      }));
    } finally {
      await db.close();
    }
  } catch {
    // fall through to seed
  }

  // 3) Seed catalog fallback so public page always renders contract tiers
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
