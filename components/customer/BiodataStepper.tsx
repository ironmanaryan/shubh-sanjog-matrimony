'use client'

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { requestJson } from '@/lib/api-client';

// Biodata sections exactly as scoped (scope PDF §5-§6):
// Personal Details | Education & Career | Lifestyle | Family | Partner Preferences
type PersonalInfo = {
  firstName?: string;
  lastName?: string;
  gender?: string;
  dob?: string;
  age?: number;
  height?: string;
  weight?: string;
  religion?: string;
  caste?: string;
  subCaste?: string;
  motherTongue?: string;
  maritalStatus?: string;
  city?: string;
  state?: string;
  country?: string;
  citizenship?: string;
  nriStatus?: boolean;
  manglikStatus?: string;
  horoscopeDetails?: string;
  mobile?: string;
  email?: string;
  // Lifestyle fields persist inside the personal section (scope PDF §5)
  foodPreference?: string;
  smoking?: string;
  drinking?: string;
  hobbies?: string;
  interests?: string;
  about?: string;
};

type EducationInfo = {
  highestQualification?: string;
  educationDetails?: string;
  profession?: string;
  jobType?: string;
  company?: string;
  annualIncome?: string;
  workLocation?: string;
  experience?: string;
};

// Lifestyle fields persist inside the personal section on the server
type LifestyleInfo = {
  foodPreference?: string;
  smoking?: string;
  drinking?: string;
  hobbies?: string;
  interests?: string;
  about?: string;
};

type FamilyInfo = {
  fatherName?: string;
  fatherOccupation?: string;
  motherName?: string;
  motherOccupation?: string;
  numberOfBrothers?: number;
  numberOfSisters?: number;
  familyType?: string;
  familyStatus?: string;
  familyLocation?: string;
  otherInfo?: string;
};

type PreferenceInfo = {
  preferredGender?: string;
  minAge?: number;
  maxAge?: number;
  minHeight?: string;
  maxHeight?: string;
  religion?: string;
  caste?: string;
  subCaste?: string;
  motherTongue?: string;
  maritalStatus?: string;
  education?: string;
  profession?: string;
  incomeRange?: string;
  location?: string;
  country?: string;
  nriPreference?: boolean;
  manglikPreference?: string;
  lifestyle?: string;
  foodPreference?: string;
  otherRequirements?: string;
  aboutPartner?: string;
  // Free-text expectations behind "What I am looking for in my partner"
  // (legacy profiles kept this under `aboutPartner`; migrated on load).
  partnerExpectationsText?: string;
};

type BiodataState = {
  personal: PersonalInfo;
  education: EducationInfo;
  family: FamilyInfo;
  preferences: PreferenceInfo;
};

const emptyBiodata: BiodataState = {
  personal: {},
  education: {},
  family: {},
  preferences: {},
};

// Shape of GET/POST /profile* responses (mirrors server profileController).
type ProfileEnvelope = {
  profile?: {
    personal?: Partial<PersonalInfo>;
    education?: Partial<EducationInfo>;
    family?: Partial<FamilyInfo>;
    preferences?: Partial<PreferenceInfo>;
    status?: string;
    reviewNote?: string | null;
    [key: string]: unknown;
  };
};

const inputClass = 'w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2 text-sm text-[#2c0d16] outline-none focus:border-[#d4a64a]';

// Character cap for the "What I am looking for in my partner" free-text field.
const PARTNER_EXPECTATIONS_MAX = 1000;

export default function BiodataStepper({ initial }: { initial?: Partial<BiodataState> }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [reviewStatus, setReviewStatus] = useState<string>('Draft');
  const [reviewNote, setReviewNote] = useState<string | null>(null);
  const [data, setData] = useState<BiodataState>({
    ...emptyBiodata,
    ...initial,
  });

  // steps map 1:1 to the scope document sections
  const steps = ['Personal', 'Education & Career', 'Lifestyle', 'Family', 'Partner Preferences'];

  function update<K extends keyof BiodataState>(section: K, key: string, value: unknown) {
    setData((s) => ({
      ...s,
      [section]: { ...(s[section] as Record<string, unknown>), [key]: value },
    }));
  }

  function updatePersonalLifestyle(key: keyof LifestyleInfo, value: unknown) {
    setData((s) => ({ ...s, personal: { ...s.personal, [key]: value } }));
  }

  // keep numeric fields clean instead of storing 0 for empty inputs
  function toNumber(value: string): number | undefined {
    return value.trim() === '' ? undefined : Number(value);
  }

  useEffect(() => {
    // Load the SAVED profile from MongoDB when a token is present. New
    // accounts start with a completely blank form — no demo seed data.
    async function load() {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) return;
      try {
        const { ok, json } = await requestJson<ProfileEnvelope>('/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!ok) return; // keep the blank form on failure
        const p = json?.profile || {};
        // Legacy profiles saved this free-text under `aboutPartner` — carry it
        // into `partnerExpectationsText` so nothing is lost on load.
        const prefs = { ...(p.preferences || {}) };
        if (!prefs.partnerExpectationsText && prefs.aboutPartner) {
          prefs.partnerExpectationsText = prefs.aboutPartner;
        }
        setReviewStatus(p.status || 'Draft');
        setReviewNote(p.reviewNote || null);
        setData((s) => ({
          personal: { ...s.personal, ...(p.personal || {}) },
          education: { ...s.education, ...(p.education || {}) },
          family: { ...s.family, ...(p.family || {}) },
          preferences: { ...s.preferences, ...prefs },
        }));
      } catch (e) {
        console.error('loading saved profile failed', e);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveStep(): Promise<boolean> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setStatusMessage('Please log in to save your biodata.');
      return false;
    }

    setSaving(true);
    setStatusMessage('');
    try {
      let endpoint = '';
      if (step === 0) endpoint = '/profile/personal';
      if (step === 1) endpoint = '/profile/education';
      if (step === 2) endpoint = '/profile/personal'; // lifestyle persists in the personal section
      if (step === 3) endpoint = '/profile/family';
      if (step === 4) endpoint = '/profile/preferences';

      const body = (() => {
        switch (step) {
          case 0:
            return data.personal;
          case 1:
            return data.education;
          case 2:
            return {
              foodPreference: data.personal.foodPreference,
              smoking: data.personal.smoking,
              drinking: data.personal.drinking,
              hobbies: data.personal.hobbies,
              interests: data.personal.interests,
              about: data.personal.about,
            };
          case 3:
            return data.family;
          default:
            return data.preferences;
        }
      })();

      const { ok, json, networkError } = await requestJson(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      // Offline ("TypeError: Failed to fetch") — keep the edits locally so the
      // user can continue through the stepper instead of dead-ending.
      if (networkError) {
        setStatusMessage('Saved on this device for now — it will sync once the API server is reachable.');
        return true;
      }

      const saved = (json ?? {}) as ProfileEnvelope;
      if (!ok) throw new Error('Save failed');
      // merge returned profile to keep client state consistent
      if (saved.profile) {
        setReviewStatus(saved.profile.status || 'Draft');
        setReviewNote(saved.profile.reviewNote || null);
        setData((s) => ({
          personal: { ...s.personal, ...(saved.profile?.personal || {}) },
          education: { ...s.education, ...(saved.profile?.education || {}) },
          family: { ...s.family, ...(saved.profile?.family || {}) },
          preferences: { ...s.preferences, ...(saved.profile?.preferences || {}) },
        }));
      }
      return true;
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Save failed. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  const handleNext = async () => {
    const ok = await saveStep();
    if (ok && step < steps.length - 1) setStep((s) => s + 1);
  };

  // Submit the completed biodata for admin review (scope PDF §22)
  const handleSubmitForReview = async () => {
    setSubmitting(true);
    setStatusMessage('');
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) {
        setStatusMessage('Please log in to submit your profile.');
        return;
      }
      const { ok, json, networkError } = await requestJson('/profile/submit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (networkError) {
        // Offline — reflect the submitted state locally instead of failing.
        setReviewStatus('Submitted');
        setReviewNote(null);
        setStatusMessage('Profile marked as submitted on this device. It will be sent for review once the API server is reachable.');
        return;
      }
      const detail = (json ?? {}) as { error?: string };
      if (!ok) throw new Error(detail.error || 'Submission failed');
      setReviewStatus('Submitted');
      setReviewNote(null);
      setStatusMessage('Profile submitted for admin review. You will be notified after verification.');
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = () => {
    const styles: Record<string, string> = {
      Draft: 'bg-[#f3f4f6] text-[#4b5563]',
      Submitted: 'bg-[#fff0cf] text-[#8a5a11]',
      'Under Review': 'bg-[#e0ecff] text-[#1d4ed8]',
      Approved: 'bg-[#eaf8ef] text-[#0a7d4c]',
      Rejected: 'bg-[#ffe5e5] text-[#9b1f2f]',
    };
    return (
      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${styles[reviewStatus] || styles.Draft}`}>
        {reviewStatus}
      </span>
    );
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {steps.map((s, i) => (
            <button key={s} onClick={() => setStep(i)} className="flex items-center gap-2 text-left">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full font-bold ${i <= step ? 'bg-gradient-to-br from-[#7b102d] to-[#d4a64a] text-white' : 'border bg-white'}`}>
                {i + 1}
              </div>
              <span className={`hidden text-xs font-semibold sm:inline ${i === step ? 'text-[#7b102d]' : 'text-[#6a4a57]'}`}>{s}</span>
            </button>
          ))}
        </div>
        {statusBadge()}
      </div>

      {reviewNote && (
        <div className="mb-4 rounded-2xl border border-[#f3cccc] bg-[#fdf1f1] p-3 text-sm font-medium text-[#9b1f2f]">
          Reviewer note: {reviewNote}
        </div>
      )}

      <div className="rounded-2xl border border-[#f2d9a8] bg-white p-6 shadow-sm">
        {statusMessage && (
          <div className="mb-4 rounded-2xl border border-[#f2d8a8] bg-[#fffaf1] px-3 py-2 text-sm text-[#5a3743]">{statusMessage}</div>
        )}

        {step === 0 && (
          <div>
            <h3 className="mb-3 text-lg font-bold">Personal Details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={data.personal.firstName || ''} onChange={(e) => update('personal', 'firstName', e.target.value)} placeholder="First name" className={inputClass} />
              <input value={data.personal.lastName || ''} onChange={(e) => update('personal', 'lastName', e.target.value)} placeholder="Last name" className={inputClass} />
              <select value={data.personal.gender || ''} onChange={(e) => update('personal', 'gender', e.target.value)} className={inputClass}>
                <option value="">Gender</option>
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>
              <input type="date" value={data.personal.dob || ''} onChange={(e) => update('personal', 'dob', e.target.value)} placeholder="Date of birth" className={inputClass} />
              <input type="number" value={data.personal.age ?? ''} onChange={(e) => update('personal', 'age', toNumber(e.target.value))} placeholder="Age" className={inputClass} />
              <input value={data.personal.height || ''} onChange={(e) => update('personal', 'height', e.target.value)} placeholder="Height (e.g., 5ft 6in)" className={inputClass} />
              <input value={data.personal.weight || ''} onChange={(e) => update('personal', 'weight', e.target.value)} placeholder="Weight (kg)" className={inputClass} />
              <input value={data.personal.religion || ''} onChange={(e) => update('personal', 'religion', e.target.value)} placeholder="Religion" className={inputClass} />
              <input value={data.personal.caste || ''} onChange={(e) => update('personal', 'caste', e.target.value)} placeholder="Caste / Community" className={inputClass} />
              <input value={data.personal.subCaste || ''} onChange={(e) => update('personal', 'subCaste', e.target.value)} placeholder="Sub-caste" className={inputClass} />
              <input value={data.personal.motherTongue || ''} onChange={(e) => update('personal', 'motherTongue', e.target.value)} placeholder="Mother tongue" className={inputClass} />
              <select value={data.personal.maritalStatus || ''} onChange={(e) => update('personal', 'maritalStatus', e.target.value)} className={inputClass}>
                <option value="">Marital status</option>
                <option>Never Married</option>
                <option>Divorced</option>
                <option>Widowed</option>
              </select>
              <input value={data.personal.city || ''} onChange={(e) => update('personal', 'city', e.target.value)} placeholder="City" className={inputClass} />
              <input value={data.personal.state || ''} onChange={(e) => update('personal', 'state', e.target.value)} placeholder="State" className={inputClass} />
              <input value={data.personal.country || ''} onChange={(e) => update('personal', 'country', e.target.value)} placeholder="Country" className={inputClass} />
              <input value={data.personal.citizenship || ''} onChange={(e) => update('personal', 'citizenship', e.target.value)} placeholder="Citizenship" className={inputClass} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!data.personal.nriStatus} onChange={(e) => update('personal', 'nriStatus', e.target.checked)} /> NRI status
              </label>
              <select value={data.personal.manglikStatus || ''} onChange={(e) => update('personal', 'manglikStatus', e.target.value)} className={inputClass}>
                <option value="">Manglik status</option>
                <option>Yes</option>
                <option>No</option>
                <option>Don&apos;t Know</option>
              </select>
              <input value={data.personal.horoscopeDetails || ''} onChange={(e) => update('personal', 'horoscopeDetails', e.target.value)} placeholder="Horoscope / Kundli details (birth time, place)" className={`sm:col-span-2 ${inputClass}`} />
              <input value={data.personal.mobile || ''} onChange={(e) => update('personal', 'mobile', e.target.value)} placeholder="Mobile (kept private until interest accepted)" className={inputClass} />
              <input value={data.personal.email || ''} onChange={(e) => update('personal', 'email', e.target.value)} placeholder="Email" className={inputClass} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h3 className="mb-3 text-lg font-bold">Education &amp; Career</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={data.education.highestQualification || ''} onChange={(e) => update('education', 'highestQualification', e.target.value)} placeholder="Highest qualification" className={inputClass} />
              <input value={data.education.educationDetails || ''} onChange={(e) => update('education', 'educationDetails', e.target.value)} placeholder="Education details" className={inputClass} />
              <input value={data.education.profession || ''} onChange={(e) => update('education', 'profession', e.target.value)} placeholder="Profession" className={inputClass} />
              <input value={data.education.jobType || ''} onChange={(e) => update('education', 'jobType', e.target.value)} placeholder="Job / Business" className={inputClass} />
              <input value={data.education.company || ''} onChange={(e) => update('education', 'company', e.target.value)} placeholder="Company / Organization" className={inputClass} />
              <input value={data.education.annualIncome || ''} onChange={(e) => update('education', 'annualIncome', e.target.value)} placeholder="Annual income" className={inputClass} />
              <input value={data.education.workLocation || ''} onChange={(e) => update('education', 'workLocation', e.target.value)} placeholder="Work location" className={inputClass} />
              <input value={data.education.experience || ''} onChange={(e) => update('education', 'experience', e.target.value)} placeholder="Experience (e.g., 5 years)" className={inputClass} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h3 className="mb-3 text-lg font-bold">Lifestyle</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <select value={data.personal.foodPreference || ''} onChange={(e) => updatePersonalLifestyle('foodPreference', e.target.value)} className={inputClass}>
                <option value="">Food preference</option>
                <option>Vegetarian</option>
                <option>Non-Vegetarian</option>
                <option>Eggetarian</option>
                <option>Jain</option>
                <option>No Preference</option>
              </select>
              <div className="grid grid-cols-2 gap-3">
                <select value={data.personal.smoking || ''} onChange={(e) => updatePersonalLifestyle('smoking', e.target.value)} className={inputClass}>
                  <option value="">Smoking</option>
                  <option>No</option>
                  <option>Occasionally</option>
                  <option>Regularly</option>
                </select>
                <select value={data.personal.drinking || ''} onChange={(e) => updatePersonalLifestyle('drinking', e.target.value)} className={inputClass}>
                  <option value="">Drinking</option>
                  <option>No</option>
                  <option>Occasionally</option>
                  <option>Regularly</option>
                </select>
              </div>
              <input value={data.personal.hobbies || ''} onChange={(e) => updatePersonalLifestyle('hobbies', e.target.value)} placeholder="Hobbies" className={inputClass} />
              <input value={data.personal.interests || ''} onChange={(e) => updatePersonalLifestyle('interests', e.target.value)} placeholder="Interests" className={inputClass} />
              <textarea value={data.personal.about || ''} onChange={(e) => updatePersonalLifestyle('about', e.target.value)} placeholder="Personality / About me" rows={4} className={`sm:col-span-2 ${inputClass}`} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h3 className="mb-3 text-lg font-bold">Family Information</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={data.family.fatherName || ''} onChange={(e) => update('family', 'fatherName', e.target.value)} placeholder="Father's name" className={inputClass} />
              <input value={data.family.fatherOccupation || ''} onChange={(e) => update('family', 'fatherOccupation', e.target.value)} placeholder="Father's occupation" className={inputClass} />
              <input value={data.family.motherName || ''} onChange={(e) => update('family', 'motherName', e.target.value)} placeholder="Mother's name" className={inputClass} />
              <input value={data.family.motherOccupation || ''} onChange={(e) => update('family', 'motherOccupation', e.target.value)} placeholder="Mother's occupation" className={inputClass} />
              <input type="number" value={data.family.numberOfBrothers ?? ''} onChange={(e) => update('family', 'numberOfBrothers', toNumber(e.target.value))} placeholder="# of brothers" className={inputClass} />
              <input type="number" value={data.family.numberOfSisters ?? ''} onChange={(e) => update('family', 'numberOfSisters', toNumber(e.target.value))} placeholder="# of sisters" className={inputClass} />
              <input value={data.family.familyType || ''} onChange={(e) => update('family', 'familyType', e.target.value)} placeholder="Family type (Nuclear / Joint)" className={inputClass} />
              <input value={data.family.familyStatus || ''} onChange={(e) => update('family', 'familyStatus', e.target.value)} placeholder="Family status" className={inputClass} />
              <input value={data.family.familyLocation || ''} onChange={(e) => update('family', 'familyLocation', e.target.value)} placeholder="Family location" className={inputClass} />
              <textarea value={data.family.otherInfo || ''} onChange={(e) => update('family', 'otherInfo', e.target.value)} placeholder="Other relevant family information" rows={2} className={`sm:col-span-2 ${inputClass}`} />
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h3 className="mb-3 text-lg font-bold">Partner Preferences</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <select value={data.preferences.preferredGender || ''} onChange={(e) => update('preferences', 'preferredGender', e.target.value)} className={inputClass}>
                <option value="">Preferred gender</option>
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>
              <div className="flex gap-2">
                <input type="number" value={data.preferences.minAge ?? ''} onChange={(e) => update('preferences', 'minAge', toNumber(e.target.value))} placeholder="Min age" className={inputClass} />
                <input type="number" value={data.preferences.maxAge ?? ''} onChange={(e) => update('preferences', 'maxAge', toNumber(e.target.value))} placeholder="Max age" className={inputClass} />
              </div>
              <input value={data.preferences.minHeight || ''} onChange={(e) => update('preferences', 'minHeight', e.target.value)} placeholder="Min height" className={inputClass} />
              <input value={data.preferences.maxHeight || ''} onChange={(e) => update('preferences', 'maxHeight', e.target.value)} placeholder="Max height" className={inputClass} />
              <input value={data.preferences.religion || ''} onChange={(e) => update('preferences', 'religion', e.target.value)} placeholder="Religion" className={inputClass} />
              <input value={data.preferences.caste || ''} onChange={(e) => update('preferences', 'caste', e.target.value)} placeholder="Caste / Community" className={inputClass} />
              <input value={data.preferences.subCaste || ''} onChange={(e) => update('preferences', 'subCaste', e.target.value)} placeholder="Sub-caste" className={inputClass} />
              <input value={data.preferences.motherTongue || ''} onChange={(e) => update('preferences', 'motherTongue', e.target.value)} placeholder="Mother tongue" className={inputClass} />
              <input value={data.preferences.maritalStatus || ''} onChange={(e) => update('preferences', 'maritalStatus', e.target.value)} placeholder="Marital status" className={inputClass} />
              <input value={data.preferences.education || ''} onChange={(e) => update('preferences', 'education', e.target.value)} placeholder="Education" className={inputClass} />
              <input value={data.preferences.profession || ''} onChange={(e) => update('preferences', 'profession', e.target.value)} placeholder="Profession" className={inputClass} />
              <input value={data.preferences.incomeRange || ''} onChange={(e) => update('preferences', 'incomeRange', e.target.value)} placeholder="Income range" className={inputClass} />
              <input value={data.preferences.location || ''} onChange={(e) => update('preferences', 'location', e.target.value)} placeholder="Preferred location(s)" className={inputClass} />
              <input value={data.preferences.country || ''} onChange={(e) => update('preferences', 'country', e.target.value)} placeholder="Preferred country" className={inputClass} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!data.preferences.nriPreference} onChange={(e) => update('preferences', 'nriPreference', e.target.checked)} /> Open to NRI match
              </label>
              <select value={data.preferences.manglikPreference || ''} onChange={(e) => update('preferences', 'manglikPreference', e.target.value)} className={inputClass}>
                <option value="">Manglik preference</option>
                <option>Yes</option>
                <option>No</option>
                <option>Don&apos;t Know</option>
              </select>
              <input value={data.preferences.lifestyle || ''} onChange={(e) => update('preferences', 'lifestyle', e.target.value)} placeholder="Lifestyle preferences" className={inputClass} />
              <select value={data.preferences.foodPreference || ''} onChange={(e) => update('preferences', 'foodPreference', e.target.value)} className={inputClass}>
                <option value="">Food preference</option>
                <option>Vegetarian</option>
                <option>Non-Vegetarian</option>
                <option>Eggetarian</option>
                <option>Jain</option>
                <option>No Preference</option>
              </select>
              <div className="sm:col-span-2">
                <textarea value={data.preferences.otherRequirements || ''} onChange={(e) => update('preferences', 'otherRequirements', e.target.value)} placeholder="Other requirements" rows={2} className={`w-full ${inputClass}`} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="partner-expectations" className="mb-1 block text-sm font-semibold">
                  What I am looking for in my partner
                </label>
                <textarea
                  id="partner-expectations"
                  value={data.preferences.partnerExpectationsText || ''}
                  onChange={(e) => update('preferences', 'partnerExpectationsText', e.target.value)}
                  placeholder="Describe any specific qualities, values, family expectations, or preferences that aren't covered above..."
                  rows={4}
                  maxLength={PARTNER_EXPECTATIONS_MAX}
                  className={`w-full ${inputClass}`}
                />
                <div
                  aria-live="polite"
                  className={`mt-1 text-right text-xs ${
                    (data.preferences.partnerExpectationsText || '').length >= PARTNER_EXPECTATIONS_MAX
                      ? 'text-[#b45309]'
                      : 'text-[#9a8290]'
                  }`}
                >
                  {(data.preferences.partnerExpectationsText || '').length}/{PARTNER_EXPECTATIONS_MAX} characters
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stacked, full-width buttons on mobile (iPhone SE-safe); original
            inline row restored from sm up. */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-2">
            <button disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))} className="w-full rounded-lg border px-6 py-3 text-sm disabled:opacity-50 sm:w-auto sm:px-4 sm:py-2">
              Back
            </button>
            <button onClick={handleNext} disabled={saving} className="w-full rounded-lg bg-[#7b102d] px-6 py-3 text-sm font-semibold text-white disabled:opacity-70 sm:w-auto sm:px-4 sm:py-2">
              {saving ? 'Saving...' : step === steps.length - 1 ? 'Save Preferences' : 'Save & Next'}
            </button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
            <Link href="/customer" className="w-full py-2 text-center text-sm text-[#6a4a57] hover:text-[#7b102d] sm:w-auto sm:text-left">Cancel</Link>
            <button
              onClick={handleSubmitForReview}
              disabled={submitting}
              title="Submit your biodata for admin verification"
              className="w-full rounded-full border border-[#d4a64a] bg-[#fffaf0] px-4 py-3 text-sm font-bold text-[#7b102d] disabled:opacity-70 sm:w-auto sm:py-2"
            >
              {submitting ? 'Submitting…' : 'Submit for Review'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
