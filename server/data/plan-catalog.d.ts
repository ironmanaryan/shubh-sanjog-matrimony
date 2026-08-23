// Type declarations for server/data/plan-catalog.js (CommonJS seed catalog)
export interface PlanSeed {
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
  sortOrder: number;
}

export const MEMBERSHIP_PACKAGES: Record<string, PlanSeed>;
export const UPI_CONFIG: { upiId: string; payeeName: string };
