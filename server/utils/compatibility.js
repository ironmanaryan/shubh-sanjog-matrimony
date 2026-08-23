// Automated Profile Compatibility Score (PRD: high-priority #1).
//
// Scores a candidate profile against a viewer's saved partner preferences
// across the five PRD dimensions — age, religion/caste, education/career,
// location and manglik status — returning a 0–100 percentage with a breakdown.
//
// Scoring contract (identical mirror lives in lib/compatibility.ts):
//   - dimension satisfied            -> full weight
//   - dimension explicitly conflicted -> 0
//   - data missing / unconstrained   -> NEUTRAL_CREDIT (70%) of the weight,
//     so sparse profiles degrade gracefully instead of unfairly zeroing out.
const WEIGHTS = { age: 25, caste: 20, education: 20, location: 15, manglik: 20 };
const NEUTRAL_CREDIT = 0.7;

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

// Token overlap for free-text fields ("engineer mba" vs "software engineer")
function tokensOverlap(a, b) {
  const at = norm(a).split(/[^a-z0-9]+/).filter(Boolean);
  const bt = norm(b).split(/[^a-z0-9]+/).filter(Boolean);
  if (at.length === 0 || bt.length === 0) return false;
  return at.some((t) => bt.some((u) => t === u || (t.length > 3 && u.includes(t)) || (u.length > 3 && t.includes(u))));
}

function ageBucket(value) {
  const n = norm(value);
  if (n === '' || n === 'any') return 'any';
  if (n.includes('anshik') || n.includes('partial')) return 'partial';
  // "No Manglik"/"Non Manglik"/"No" -> non ; "Yes Manglik"/"Yes" -> manglik
  if (/(^|\b)no/.test(n) || n.startsWith('non')) return 'non';
  if (n.includes('yes') || n === 'manglik') return 'manglik';
  return 'any';
}

function scoreAge(prefs, candidateAge) {
  const min = Number(prefs.minAge) > 0 ? Number(prefs.minAge) : null;
  const max = Number(prefs.maxAge) > 0 ? Number(prefs.maxAge) : null;
  if ((min === null && max === null) || candidateAge === null || candidateAge === undefined) {
    return Math.round(WEIGHTS.age * NEUTRAL_CREDIT);
  }
  if (min !== null && max !== null) {
    if (candidateAge >= min && candidateAge <= max) return WEIGHTS.age;
    const dist = candidateAge < min ? min - candidateAge : candidateAge - max;
    if (dist <= 2) return Math.round(WEIGHTS.age * 0.6);
    if (dist <= 5) return Math.round(WEIGHTS.age * 0.32);
    return 0;
  }
  const bound = min !== null ? min : max;
  const dist = Math.abs(candidateAge - bound);
  if (dist === 0) return WEIGHTS.age;
  if (dist <= 2) return Math.round(WEIGHTS.age * 0.6);
  if (dist <= 5) return Math.round(WEIGHTS.age * 0.32);
  return 0;
}

function scoreCasteReligion(prefs, candidate) {
  let casteScore;
  const prefCaste = norm(prefs.caste);
  if (prefCaste === '' || prefCaste === 'any') casteScore = Math.round(12 * NEUTRAL_CREDIT);
  else if (tokensOverlap(prefCaste, candidate.caste) || norm(candidate.caste).includes(prefCaste)) casteScore = 12;
  else casteScore = 0;

  let religionScore;
  const prefReligion = norm(prefs.religion);
  if (prefReligion === '' || prefReligion === 'any') religionScore = Math.round(8 * NEUTRAL_CREDIT);
  else if (norm(candidate.religion) === prefReligion || norm(candidate.religion).includes(prefReligion)) religionScore = 8;
  else religionScore = 0;

  return casteScore + religionScore;
}

function scoreEducation(prefs, candidate) {
  const prefEdu = norm(prefs.education);
  if (prefEdu === '') return Math.round(WEIGHTS.education * NEUTRAL_CREDIT);
  const haystack = `${candidate.highestQualification || ''} ${candidate.profession || ''}`;
  if (tokensOverlap(prefEdu, haystack)) return WEIGHTS.education;
  // free-text field — a non-overlap is weak evidence, grant courtesy credit
  return Math.round(WEIGHTS.education * 0.3);
}

function scoreLocation(prefs, candidate) {
  const prefLoc = norm(prefs.location);
  if (prefLoc === '') return Math.round(WEIGHTS.location * NEUTRAL_CREDIT);
  const hay = `${candidate.city || ''} ${candidate.state || ''}`;
  if (tokensOverlap(prefLoc, hay)) return WEIGHTS.location;
  return 0;
}

function scoreManglik(prefs, candidate) {
  const pref = ageBucket(prefs.manglikPreference); // reuse any/non/partial/manglik parsing
  const cand = ageBucket(candidate.manglik);
  if (pref === 'any' || cand === 'any') return Math.round(WEIGHTS.manglik * NEUTRAL_CREDIT);
  if (pref === cand) return WEIGHTS.manglik;
  // strict "non" viewers may still accept a partial (Anshik) match at half credit
  if (pref === 'non' && cand === 'partial') return Math.round(WEIGHTS.manglik * 0.5);
  return 0;
}

// viewerPrefs: the customer's saved profile.preferences
// candidate: { age, religion, caste, highestQualification?, profession?, education?,
//              city?, state?, manglik? }
function computeCompatibility(viewerPrefs, candidate) {
  const prefs = viewerPrefs && typeof viewerPrefs === 'object' ? viewerPrefs : {};
  const breakdown = [
    { key: 'age', label: 'Age', score: scoreAge(prefs, candidate.age == null ? null : Number(candidate.age)), weight: WEIGHTS.age },
    { key: 'caste', label: 'Religion & Caste', score: scoreCasteReligion(prefs, candidate), weight: WEIGHTS.caste },
    {
      key: 'education',
      label: 'Education & Career',
      score: scoreEducation(prefs, { ...candidate, profession: candidate.profession ?? candidate.work }),
      weight: WEIGHTS.education,
    },
    { key: 'location', label: 'Location', score: scoreLocation(prefs, candidate), weight: WEIGHTS.location },
    { key: 'manglik', label: 'Manglik status', score: scoreManglik(prefs, candidate), weight: WEIGHTS.manglik },
  ];
  const raw = breakdown.reduce((sum, d) => sum + d.score, 0);
  const total = breakdown.reduce((sum, d) => sum + d.weight, 0);
  const score = Math.max(0, Math.min(100, Math.round((raw / total) * 100)));
  const reasons = breakdown.map((d) => `${d.label} ${d.score}/${d.weight}`);
  return { score, breakdown, reasons };
}

module.exports = { computeCompatibility, WEIGHTS, NEUTRAL_CREDIT };
