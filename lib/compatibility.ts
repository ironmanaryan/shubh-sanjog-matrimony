// Automated Profile Compatibility Score (PRD: high-priority #1).
//
// Client-side mirror of server/utils/compatibility.js — the server computes
// authoritative scores in /api/matches/search, this mirror exists so offline /
// demo data and any client-side recomputation stay consistent.
//
// Contract (identical to the server copy):
//   - dimension satisfied            -> full weight
//   - dimension explicitly conflicted -> 0
//   - data missing / unconstrained   -> 70% of the weight (neutral credit)
export const COMPATIBILITY_WEIGHTS = { age: 25, caste: 20, education: 20, location: 15, manglik: 20 } as const;
const NEUTRAL_CREDIT = 0.7;

export type CompatibilityInput = {
  age?: number | null;
  religion?: string | null;
  caste?: string | null;
  highestQualification?: string | null;
  education?: string | null;
  profession?: string | null;
  city?: string | null;
  state?: string | null;
  manglik?: string | null;
};

export type ViewerPreferences = {
  minAge?: number | string;
  maxAge?: number | string;
  religion?: string | null;
  caste?: string | null;
  education?: string | null;
  location?: string | null;
  manglikPreference?: string | null;
};

export type CompatibilityDimension = { key: string; label: string; score: number; weight: number };
export type CompatibilityResult = { score: number; breakdown: CompatibilityDimension[]; reasons: string[] };

function norm(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function tokensOverlap(a: string, b: string): boolean {
  const at = norm(a).split(/[^a-z0-9]+/).filter(Boolean);
  const bt = norm(b).split(/[^a-z0-9]+/).filter(Boolean);
  if (at.length === 0 || bt.length === 0) return false;
  return at.some((t) => bt.some((u) => t === u || (t.length > 3 && u.includes(t)) || (u.length > 3 && t.includes(u))));
}

function manglikBucket(value: unknown): 'any' | 'non' | 'partial' | 'manglik' {
  const n = norm(value);
  if (n === '' || n === 'any') return 'any';
  if (n.includes('anshik') || n.includes('partial')) return 'partial';
  if (/(^|\b)no/.test(n) || n.startsWith('non')) return 'non';
  if (n.includes('yes') || n === 'manglik') return 'manglik';
  return 'any';
}

function scoreAge(prefs: ViewerPreferences, candidateAge: number | null): number {
  const min = Number(prefs.minAge) > 0 ? Number(prefs.minAge) : null;
  const max = Number(prefs.maxAge) > 0 ? Number(prefs.maxAge) : null;
  if ((min === null && max === null) || candidateAge === null || candidateAge === undefined) {
    return Math.round(COMPATIBILITY_WEIGHTS.age * NEUTRAL_CREDIT);
  }
  if (min !== null && max !== null) {
    if (candidateAge >= min && candidateAge <= max) return COMPATIBILITY_WEIGHTS.age;
    const dist = candidateAge < min ? min - candidateAge : candidateAge - max;
    if (dist <= 2) return Math.round(COMPATIBILITY_WEIGHTS.age * 0.6);
    if (dist <= 5) return Math.round(COMPATIBILITY_WEIGHTS.age * 0.32);
    return 0;
  }
  const bound = min !== null ? min : max as number;
  const dist = Math.abs(candidateAge - bound);
  if (dist === 0) return COMPATIBILITY_WEIGHTS.age;
  if (dist <= 2) return Math.round(COMPATIBILITY_WEIGHTS.age * 0.6);
  if (dist <= 5) return Math.round(COMPATIBILITY_WEIGHTS.age * 0.32);
  return 0;
}

function scoreCasteReligion(prefs: ViewerPreferences, candidate: CompatibilityInput): number {
  const prefCaste = norm(prefs.caste);
  const casteScore =
    prefCaste === '' || prefCaste === 'any'
      ? Math.round(12 * NEUTRAL_CREDIT)
      : tokensOverlap(prefCaste, String(candidate.caste ?? '')) || norm(candidate.caste).includes(prefCaste)
        ? 12
        : 0;

  const prefReligion = norm(prefs.religion);
  const religionScore =
    prefReligion === '' || prefReligion === 'any'
      ? Math.round(8 * NEUTRAL_CREDIT)
      : norm(candidate.religion) === prefReligion || norm(candidate.religion).includes(prefReligion)
        ? 8
        : 0;

  return casteScore + religionScore;
}

function scoreEducation(prefs: ViewerPreferences, candidate: CompatibilityInput): number {
  const prefEdu = norm(prefs.education);
  if (prefEdu === '') return Math.round(COMPATIBILITY_WEIGHTS.education * NEUTRAL_CREDIT);
  const haystack = `${candidate.highestQualification ?? ''} ${candidate.profession ?? ''}`;
  if (tokensOverlap(prefEdu, haystack)) return COMPATIBILITY_WEIGHTS.education;
  // free-text field — a non-overlap is weak evidence, grant courtesy credit
  return Math.round(COMPATIBILITY_WEIGHTS.education * 0.3);
}

function scoreLocation(prefs: ViewerPreferences, candidate: CompatibilityInput): number {
  const prefLoc = norm(prefs.location);
  if (prefLoc === '') return Math.round(COMPATIBILITY_WEIGHTS.location * NEUTRAL_CREDIT);
  const hay = `${candidate.city ?? ''} ${candidate.state ?? ''}`;
  if (tokensOverlap(prefLoc, hay)) return COMPATIBILITY_WEIGHTS.location;
  return 0;
}

function scoreManglik(prefs: ViewerPreferences, candidate: CompatibilityInput): number {
  const pref = manglikBucket(prefs.manglikPreference);
  const cand = manglikBucket(candidate.manglik);
  if (pref === 'any' || cand === 'any') return Math.round(COMPATIBILITY_WEIGHTS.manglik * NEUTRAL_CREDIT);
  if (pref === cand) return COMPATIBILITY_WEIGHTS.manglik;
  if (pref === 'non' && cand === 'partial') return Math.round(COMPATIBILITY_WEIGHTS.manglik * 0.5);
  return 0;
}

export function computeCompatibility(viewerPrefs: ViewerPreferences | null | undefined, candidate: CompatibilityInput): CompatibilityResult {
  const prefs: ViewerPreferences = viewerPrefs && typeof viewerPrefs === 'object' ? viewerPrefs : {};
  const breakdown: CompatibilityDimension[] = [
    { key: 'age', label: 'Age', score: scoreAge(prefs, candidate.age == null ? null : Number(candidate.age)), weight: COMPATIBILITY_WEIGHTS.age },
    { key: 'caste', label: 'Religion & Caste', score: scoreCasteReligion(prefs, candidate), weight: COMPATIBILITY_WEIGHTS.caste },
    { key: 'education', label: 'Education & Career', score: scoreEducation(prefs, candidate), weight: COMPATIBILITY_WEIGHTS.education },
    { key: 'location', label: 'Location', score: scoreLocation(prefs, candidate), weight: COMPATIBILITY_WEIGHTS.location },
    { key: 'manglik', label: 'Manglik status', score: scoreManglik(prefs, candidate), weight: COMPATIBILITY_WEIGHTS.manglik },
  ];
  const raw = breakdown.reduce((sum, d) => sum + d.score, 0);
  const total = breakdown.reduce((sum, d) => sum + d.weight, 0);
  const score = Math.max(0, Math.min(100, Math.round((raw / total) * 100)));
  const reasons = breakdown.map((d) => `${d.label} ${d.score}/${d.weight}`);
  return { score, breakdown, reasons };
}

// Badge styling shared by the dashboard highlights and match cards.
export function compatibilityBadgeClass(score: number): string {
  if (score >= 80) return 'bg-[#eaf8ef] text-[#0a7d4c]';
  if (score >= 60) return 'bg-[#fff1dc] text-[#8a5a11]';
  return 'bg-[#ffe5e5] text-[#9b1f2f]';
}
