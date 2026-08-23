import path from 'path';

// Server-only reader for the membership_plans table — the single source of
// truth for pricing shared with the Express API (same SQLite database file).
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
    // Database not reachable yet (backend never started): fall back to the seed
    // catalog so the public page still reflects the contract tiers.
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
}
