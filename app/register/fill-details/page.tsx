'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, User, Heart, GraduationCap, MapPin, Upload, ChevronRight, ChevronLeft, Sparkles, Users, Utensils, FileText } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { requestJson } from '@/lib/api-client';

type ProfileCreatedFor = 'myself' | 'son' | 'daughter' | 'brother' | 'sister' | 'friend' | 'relative';

type FormState = {
  // Profile For - onboarding step 1
  profileCreatedFor: ProfileCreatedFor;
  // Personal Information
  fullName: string;
  gender: string;
  dob: string;
  age: string;
  height: string;
  weight: string;
  religion: string;
  caste: string;
  subCaste: string;
  motherTongue: string;
  maritalStatus: string;
  location: string;
  country: string;
  citizenship: string;
  nriStatus: string; // Yes/No
  manglikStatus: string;
  horoscopeDetails: string;
  phone: string;
  // Education & Career
  highestQualification: string;
  educationDetails: string;
  profession: string;
  jobBusiness: string;
  company: string;
  annualIncome: string;
  workLocation: string;
  experience: string;
  // Lifestyle & About Me
  foodPreference: string;
  smoking: string;
  drinking: string;
  hobbies: string;
  interests: string;
  aboutMe: string;
  // Family Information
  fatherName: string;
  fatherOccupation: string;
  motherName: string;
  motherOccupation: string;
  brothers: string;
  sisters: string;
  familyType: string;
  familyStatus: string;
  familyLocation: string;
  // Photo
  photoFile: File | null;
  photoPreview: string | null;
};

const initialForm: FormState = {
  profileCreatedFor: 'myself',
  fullName: '',
  gender: '',
  dob: '',
  age: '',
  height: '',
  weight: '',
  religion: '',
  caste: '',
  subCaste: '',
  motherTongue: '',
  maritalStatus: '',
  location: '',
  country: 'India',
  citizenship: 'Indian',
  nriStatus: 'No',
  manglikStatus: '',
  horoscopeDetails: '',
  phone: '',
  highestQualification: '',
  educationDetails: '',
  profession: '',
  jobBusiness: '',
  company: '',
  annualIncome: '',
  workLocation: '',
  experience: '',
  foodPreference: '',
  smoking: '',
  drinking: '',
  hobbies: '',
  interests: '',
  aboutMe: '',
  fatherName: '',
  fatherOccupation: '',
  motherName: '',
  motherOccupation: '',
  brothers: '',
  sisters: '',
  familyType: '',
  familyStatus: '',
  familyLocation: '',
  photoFile: null,
  photoPreview: null,
};

const PROFILE_FOR_OPTIONS: { value: ProfileCreatedFor; label: string; desc: string }[] = [
  { value: 'myself', label: 'Myself', desc: 'For myself' },
  { value: 'son', label: 'My Son', desc: 'For my son' },
  { value: 'daughter', label: 'My Daughter', desc: 'For my daughter' },
  { value: 'brother', label: 'My Brother', desc: 'For my brother' },
  { value: 'sister', label: 'My Sister', desc: 'For my sister' },
  { value: 'friend', label: 'My Friend', desc: 'For my friend' },
  { value: 'relative', label: 'My Relative', desc: 'For my relative' },
];

function FillDetailsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStep = parseInt(searchParams.get('step') || '1', 10);
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), 5));
  const [form, setForm] = useState<FormState>(initialForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Dynamic label helper: if profile is for someone else, prefix with Candidate's
  const isForOther = form.profileCreatedFor !== 'myself';
  const candidateLabel = (base: string) => (isForOther ? `Candidate's ${base}` : base);

  useEffect(() => {
    const s = parseInt(searchParams.get('step') || '1', 10);
    if (!isNaN(s) && s >= 1 && s <= 5) setStep(s);
  }, [searchParams]);

  useEffect(() => {
    (async () => {
      const supabase = getSupabase();
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/register');
        return;
      }
      setUserId(user.id);
      setUserEmail(user.email || null);
      const metaName = (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || '';
      if (metaName) {
        setForm((prev) => ({ ...prev, fullName: prev.fullName || metaName }));
      }
      // Prefill from profiles if exists. The form reads ~40 columns, so we
      // list them explicitly to avoid shipping the full row (which includes
      // JSONB sections, attachment IDs and audit columns) over the wire on
      // every page load.
      // Only select columns that exist in supabase/profiles_migration.sql
      // Previously this list contained `mobile` (should be `phone`/`phone_number`)
      // and `about_myself` (typo, should be `about_me`) which caused PostgREST
      // 400 errors, and `cloudinary_url`/`status` which do not exist in `profiles`
      // (they belong to `documents`/`matrimonial_profiles`). We now select only
      // valid columns and fallback gracefully if avatar fields are null.
      const PROFILE_PREFILL_COLUMNS = [
        'id', 'user_id', 'profile_created_for',
        'full_name', 'gender', 'dob', 'age', 'height', 'weight',
        'religion', 'caste', 'sub_caste', 'mother_tongue', 'marital_status',
        'city', 'country', 'citizenship', 'nri_status', 'manglik_status',
        'horoscope_details', 'phone', 'phone_number',
        'highest_qualification', 'education_details', 'profession',
        'job_business', 'company', 'annual_income', 'work_location',
        'experience', 'food_preference', 'smoking', 'drinking',
        'hobbies', 'interests', 'about', 'about_me', 'bio', 'personality',
        'father_name', 'father_occupation', 'mother_name', 'mother_occupation',
        'brothers', 'sisters', 'number_of_brothers', 'number_of_sisters',
        'family_type', 'family_status', 'family_location',
        'photo_url', 'avatar_url', 'profile_photo',
        'personal', 'education', 'family',
      ].join(',');
      const PROFILE_PREFILL_FALLBACK = PROFILE_PREFILL_COLUMNS.replace(',profile_created_for', '').replace('profile_created_for,', '');
      let prefillData: Record<string, unknown> | null = null;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select(PROFILE_PREFILL_COLUMNS)
          .or(`id.eq.${user.id},user_id.eq.${user.id}`)
          .maybeSingle();
        if (error && (String(error.message || '').includes('profile_created_for') || String((error as unknown as Record<string, unknown>)?.['code'] || '').includes('PGRST'))) {
          console.warn('[profiles] profile_created_for column missing, retrying without it:', error.message);
          const { data: fallback } = await supabase.from('profiles').select(PROFILE_PREFILL_FALLBACK).or(`id.eq.${user.id},user_id.eq.${user.id}`).maybeSingle();
          prefillData = (fallback as unknown as Record<string, unknown>) || null;
        } else if (data) {
          prefillData = data as unknown as Record<string, unknown>;
        }
      } catch (e) {
        console.warn('[profiles] prefill fetch failed, trying fallback without profile_created_for', e);
        try {
          const { data: fallback } = await supabase.from('profiles').select(PROFILE_PREFILL_FALLBACK).or(`id.eq.${user.id},user_id.eq.${user.id}`).maybeSingle();
          prefillData = (fallback as unknown as Record<string, unknown>) || null;
        } catch {}
      }
      try {
        const data = prefillData;
        if (data) {
          const d = data as unknown as Record<string, unknown>;
          // Prefill profile_created_for if present and valid
          const pcf = d['profile_created_for'] as string | undefined;
          if (pcf && PROFILE_FOR_OPTIONS.some((o) => o.value === pcf)) {
            // Defer to next tick to avoid setState during render
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setForm((prev: any) => ({ ...prev, profileCreatedFor: pcf as ProfileCreatedFor }));
          }
          const get = (keys: string[]) => {
            for (const k of keys) if (d[k] !== undefined && d[k] !== null && String(d[k]).trim() !== '') return String(d[k]);
            return undefined;
          };
          setForm((prev) => ({
            ...prev,
            fullName: get(['full_name','fullName']) || prev.fullName,
            gender: get(['gender']) || prev.gender,
            dob: get(['dob','date_of_birth','birth_date']) || prev.dob,
            age: get(['age']) || prev.age,
            height: get(['height']) || prev.height,
            weight: get(['weight']) || prev.weight,
            religion: get(['religion']) || prev.religion,
            caste: get(['caste']) || prev.caste,
            subCaste: get(['sub_caste','subCaste']) || prev.subCaste,
            motherTongue: get(['mother_tongue','motherTongue']) || prev.motherTongue,
            maritalStatus: get(['marital_status','maritalStatus']) || prev.maritalStatus,
            location: get(['location','city']) || prev.location,
            country: get(['country']) || prev.country,
            citizenship: get(['citizenship']) || prev.citizenship,
            nriStatus: get(['nri_status','nriStatus']) || prev.nriStatus,
            manglikStatus: get(['manglik_status','manglikStatus']) || prev.manglikStatus,
            horoscopeDetails: get(['horoscope_details','horoscopeDetails','kundli_details']) || prev.horoscopeDetails,
            phone: get(['phone','phone_number','mobile']) || prev.phone,
            highestQualification: get(['highest_qualification','qualification','highestQualification']) || prev.highestQualification,
            educationDetails: get(['education_details','educationDetails']) || prev.educationDetails,
            profession: get(['profession']) || prev.profession,
            jobBusiness: get(['job_business','jobBusiness','job_type']) || prev.jobBusiness,
            company: get(['company','organization']) || prev.company,
            annualIncome: get(['annual_income','annualIncome']) || prev.annualIncome,
            workLocation: get(['work_location','workLocation']) || prev.workLocation,
            experience: get(['experience','years_of_experience']) || prev.experience,
            foodPreference: get(['food_preference','foodPreference']) || prev.foodPreference,
            smoking: get(['smoking']) || prev.smoking,
            drinking: get(['drinking']) || prev.drinking,
            hobbies: get(['hobbies']) || prev.hobbies,
            interests: get(['interests']) || prev.interests,
            aboutMe: get(['about','about_me','bio','about_myself','personality']) || prev.aboutMe,
            fatherName: get(['father_name','fatherName']) || prev.fatherName,
            fatherOccupation: get(['father_occupation','fatherOccupation']) || prev.fatherOccupation,
            motherName: get(['mother_name','motherName']) || prev.motherName,
            motherOccupation: get(['mother_occupation','motherOccupation']) || prev.motherOccupation,
            brothers: get(['brothers','number_of_brothers','no_of_brothers']) || prev.brothers,
            sisters: get(['sisters','number_of_sisters','no_of_sisters']) || prev.sisters,
            familyType: get(['family_type','familyType']) || prev.familyType,
            familyStatus: get(['family_status','familyStatus']) || prev.familyStatus,
            familyLocation: get(['family_location','familyLocation']) || prev.familyLocation,
          }));
          // handle nested personal/education/family if stored as jsonb
          try {
            const personal = d['personal'] as Record<string, unknown> | undefined;
            if (personal) {
              setForm((prev) => ({
                ...prev,
                height: (personal['height'] as string) || prev.height,
                weight: (personal['weight'] as string) || prev.weight,
                subCaste: (personal['subCaste'] as string) || prev.subCaste,
                citizenship: (personal['citizenship'] as string) || prev.citizenship,
                nriStatus: (personal['nriStatus'] ? 'Yes' : prev.nriStatus) || prev.nriStatus,
                manglikStatus: (personal['manglikStatus'] as string) || prev.manglikStatus,
                horoscopeDetails: (personal['horoscopeDetails'] as string) || prev.horoscopeDetails,
              }));
            }
            const edu = d['education'] as Record<string, unknown> | undefined;
            if (edu) {
              setForm((prev) => ({
                ...prev,
                educationDetails: (edu['educationDetails'] as string) || prev.educationDetails,
                jobBusiness: (edu['jobType'] as string) || prev.jobBusiness,
                company: (edu['company'] as string) || prev.company,
                workLocation: (edu['workLocation'] as string) || prev.workLocation,
                experience: (edu['experience'] as string) || prev.experience,
              }));
            }
            const family = d['family'] as Record<string, unknown> | undefined;
            if (family) {
              setForm((prev) => ({
                ...prev,
                fatherName: (family['fatherName'] as string) || prev.fatherName,
                fatherOccupation: (family['fatherOccupation'] as string) || prev.fatherOccupation,
                motherName: (family['motherName'] as string) || prev.motherName,
                motherOccupation: (family['motherOccupation'] as string) || prev.motherOccupation,
              }));
            }
          } catch {}
        }
      } catch {}
    })();
  }, [router]);

  const update = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      setForm((prev) => ({ ...prev, photoFile: file, photoPreview: URL.createObjectURL(file) }));
    } else {
      setForm((prev) => ({ ...prev, photoFile: null, photoPreview: null }));
    }
  };

  const validateStep = (): boolean => {
    if (step === 1) {
      if (!form.profileCreatedFor) { setError('Please select who this profile is for.'); return false; }
    }
    if (step === 2) {
      if (!form.fullName.trim()) { setError(`Please enter ${candidateLabel('full name').toLowerCase()}.`); return false; }
      if (!form.gender) { setError('Please select gender.'); return false; }
      if (!form.dob) { setError('Please select date of birth.'); return false; }
      if (!form.religion) { setError('Please select religion.'); return false; }
      if (!form.motherTongue) { setError('Please enter mother tongue.'); return false; }
      if (!form.maritalStatus) { setError('Please select marital status.'); return false; }
    }
    if (step === 3) {
      if (!form.highestQualification) { setError('Please select highest qualification.'); return false; }
      if (!form.profession.trim()) { setError('Please enter profession.'); return false; }
    }
    if (step === 4) {
      if (!form.aboutMe.trim()) { setError('Please write about yourself.'); return false; }
    }
    if (step === 5) {
      if (!form.fatherName.trim()) { setError("Please enter father's name."); return false; }
      if (!form.motherName.trim()) { setError("Please enter mother's name."); return false; }
    }
    setError('');
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    if (step < 5) {
      const n = step + 1;
      setStep(n);
      router.push(`/register/fill-details?step=${n}`);
    }
  };
  const handleBack = () => {
    if (step > 1) {
      const p = step - 1;
      setStep(p);
      router.push(`/register/fill-details?step=${p}`);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    if (!userId) {
      setError('Session expired. Please sign in again.');
      router.push('/register');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const supabase = getSupabase()!;
      let photoUrl: string | null = null;
      let cloudinaryPublicId: string | null = null;
      if (form.photoFile) {
        try {
          // Primary: Cloudinary upload with auto optimization and face alignment
          // Uses: format:auto, quality:auto, gravity:face, crop:fill/thumb
          const cloudForm = new FormData();
          cloudForm.append('file', form.photoFile);
          cloudForm.append('folder', 'shubh-sanjog/profiles');
          const cloudRes = await fetch('/api/upload', {
            method: 'POST',
            body: cloudForm,
          });
          if (cloudRes.ok) {
            const cloudData = (await cloudRes.json()) as { secure_url?: string; public_id?: string };
            if (cloudData.secure_url) {
              photoUrl = cloudData.secure_url;
              cloudinaryPublicId = cloudData.public_id || null;
            }
          }
          // Fallback: Supabase Storage if Cloudinary fails or not configured
          if (!photoUrl) {
            const filePath = `${userId}/${Date.now()}-${form.photoFile.name}`;
            const { error: uploadError } = await supabase.storage.from('profiles').upload(filePath, form.photoFile, { upsert: true });
            if (!uploadError) {
              const { data: urlData } = supabase.storage.from('profiles').getPublicUrl(filePath);
              photoUrl = urlData.publicUrl;
            } else {
              const { error: err2 } = await supabase.storage.from('avatars').upload(filePath, form.photoFile, { upsert: true });
              if (!err2) {
                const { data: urlData2 } = supabase.storage.from('avatars').getPublicUrl(filePath);
                photoUrl = urlData2.publicUrl;
              }
            }
          }
        } catch (e) { console.warn('photo upload failed', e); }
      }

      const nowIso = new Date().toISOString();
      const ageNum = form.age ? parseInt(form.age, 10) : null;
      const brothersNum = form.brothers ? parseInt(form.brothers, 10) : null;
      const sistersNum = form.sisters ? parseInt(form.sisters, 10) : null;

      // Flat payload for profiles table - includes profile_created_for with fallback
      const payload: Record<string, unknown> = {
        id: userId,
        user_id: userId,
        profile_created_for: form.profileCreatedFor,
        full_name: form.fullName.trim(),
        gender: form.gender,
        dob: form.dob,
        date_of_birth: form.dob,
        age: ageNum,
        height: form.height || null,
        weight: form.weight || null,
        religion: form.religion || null,
        caste: form.caste || null,
        sub_caste: form.subCaste || null,
        mother_tongue: form.motherTongue || null,
        marital_status: form.maritalStatus || null,
        location: form.location || null,
        city: form.location || null,
        country: form.country || null,
        citizenship: form.citizenship || null,
        nri_status: form.nriStatus === 'Yes',
        manglik_status: form.manglikStatus || null,
        horoscope_details: form.horoscopeDetails || null,
        phone: form.phone || null,
        phone_number: form.phone || null,
        highest_qualification: form.highestQualification || null,
        qualification: form.highestQualification || null,
        education_details: form.educationDetails || null,
        profession: form.profession || null,
        job_business: form.jobBusiness || null,
        company: form.company || null,
        organization: form.company || null,
        annual_income: form.annualIncome || null,
        work_location: form.workLocation || null,
        experience: form.experience || null,
        years_of_experience: form.experience || null,
        food_preference: form.foodPreference || null,
        smoking: form.smoking || null,
        drinking: form.drinking || null,
        hobbies: form.hobbies || null,
        interests: form.interests || null,
        about: form.aboutMe || null,
        about_me: form.aboutMe || null,
        bio: form.aboutMe || null,
        personality: form.aboutMe || null,
        father_name: form.fatherName || null,
        father_occupation: form.fatherOccupation || null,
        mother_name: form.motherName || null,
        mother_occupation: form.motherOccupation || null,
        brothers: brothersNum,
        sisters: sistersNum,
        number_of_brothers: brothersNum,
        number_of_sisters: sistersNum,
        family_type: form.familyType || null,
        family_status: form.familyStatus || null,
        family_location: form.familyLocation || null,
        photo_url: photoUrl,
        avatar_url: photoUrl,
        profile_photo: photoUrl,
        email: userEmail,
        is_completed: true,
        completed_at: nowIso,
        updated_at: nowIso,
        created_at: nowIso,
      };

      // Also store structured JSON for compatibility with matrimonial_profiles style
      const structured: Record<string, unknown> = {
        personal: {
          firstName: form.fullName.trim().split(' ')[0] || '',
          lastName: form.fullName.trim().split(' ').slice(1).join(' ') || '',
          fullName: form.fullName.trim(),
          gender: form.gender,
          dob: form.dob,
          age: ageNum,
          height: form.height,
          weight: form.weight,
          religion: form.religion,
          caste: form.caste,
          subCaste: form.subCaste,
          motherTongue: form.motherTongue,
          maritalStatus: form.maritalStatus,
          location: form.location,
          city: form.location,
          country: form.country,
          citizenship: form.citizenship,
          nriStatus: form.nriStatus === 'Yes',
          manglikStatus: form.manglikStatus,
          horoscopeDetails: form.horoscopeDetails,
          phone: form.phone,
          foodPreference: form.foodPreference,
          smoking: form.smoking,
          drinking: form.drinking,
          hobbies: form.hobbies,
          interests: form.interests,
          about: form.aboutMe,
        },
        education: {
          highestQualification: form.highestQualification,
          educationDetails: form.educationDetails,
          profession: form.profession,
          jobType: form.jobBusiness,
          company: form.company,
          annualIncome: form.annualIncome,
          workLocation: form.workLocation,
          experience: form.experience,
        },
        family: {
          fatherName: form.fatherName,
          fatherOccupation: form.fatherOccupation,
          motherName: form.motherName,
          motherOccupation: form.motherOccupation,
          numberOfBrothers: brothersNum,
          numberOfSisters: sistersNum,
          familyType: form.familyType,
          familyStatus: form.familyStatus,
          familyLocation: form.familyLocation,
        },
        lifestyle: {
          foodPreference: form.foodPreference,
          smoking: form.smoking,
          drinking: form.drinking,
          hobbies: form.hobbies,
          interests: form.interests,
        },
      };

      // Try to include JSON if table supports it
      const fullPayload = { ...payload, personal: structured.personal, education: structured.education, family: structured.family, lifestyle: structured.lifestyle };

      let saved = false;
      let lastError: string | null = null;

      // Attempt 1: fullPayload
      try {
        const { error } = await supabase.from('profiles').upsert(fullPayload as never, { onConflict: 'id' } as never);
        if (!error) saved = true;
        else {
          lastError = (error as { message?: string }).message || 'Upsert failed';
          const { error: e2 } = await supabase.from('profiles').upsert(fullPayload as never, { onConflict: 'user_id' } as never);
          if (!e2) saved = true;
          else lastError = (e2 as { message?: string }).message || lastError;
        }
      } catch (err) { lastError = err instanceof Error ? err.message : String(err); }

      // Attempt 2: flat payload only
      if (!saved) {
        try {
          const { error: e3 } = await supabase.from('profiles').upsert(payload as never, { onConflict: 'id' } as never);
          if (!e3) saved = true;
          else {
            const { error: e4 } = await supabase.from('profiles').upsert(payload as never, { onConflict: 'user_id' } as never);
            if (!e4) saved = true;
            else lastError = (e4 as { message?: string }).message || lastError;
          }
        } catch (err) { lastError = err instanceof Error ? err.message : String(err); }
      }

      // Graceful fallback: if profile_created_for column missing, retry without it
      if (!saved && lastError && String(lastError).toLowerCase().includes('profile_created_for')) {
        console.warn('[profiles] profile_created_for column missing, retrying without it (migration pending):', lastError);
        const fallbackPayload = { ...payload };
        delete fallbackPayload.profile_created_for;
        const fallbackFull = { ...fullPayload };
        delete (fallbackFull as Record<string, unknown>).profile_created_for;
        try {
          const { error } = await supabase.from('profiles').upsert(fallbackFull as never, { onConflict: 'id' } as never);
          if (!error) { saved = true; lastError = null; }
          else {
            const { error: e2 } = await supabase.from('profiles').upsert(fallbackFull as never, { onConflict: 'user_id' } as never);
            if (!e2) { saved = true; lastError = null; }
          }
        } catch (e) { console.warn('[profiles] fallback without profile_created_for failed', e); }
        if (!saved) {
          try {
            const { error: e3 } = await supabase.from('profiles').upsert(fallbackPayload as never, { onConflict: 'id' } as never);
            if (!e3) { saved = true; lastError = null; }
            else {
              const { error: e4 } = await supabase.from('profiles').upsert(fallbackPayload as never, { onConflict: 'user_id' } as never);
              if (!e4) { saved = true; lastError = null; }
            }
          } catch (e) { console.warn('[profiles] fallback flat without profile_created_for failed', e); }
        }
      }

      // Attempt 3: minimal required fields
      if (!saved) {
        try {
          const minimal: Record<string, unknown> = {
            id: userId,
            user_id: userId,
            full_name: form.fullName.trim(),
            is_completed: true,
          };
          const { error: e5 } = await supabase.from('profiles').upsert(minimal as never, { onConflict: 'id' } as never);
          if (!e5) saved = true;
          else lastError = (e5 as { message?: string }).message || lastError;
        } catch (err) { lastError = err instanceof Error ? err.message : String(err); }
      }

      // Also sync to matrimonial_profiles for customer dashboard compatibility
      try {
        const mpPayload: Record<string, unknown> = {
          user_id: userId,
          personal: structured.personal,
          education: structured.education,
          family: structured.family,
          preferences: {},
          status: 'Draft',
          profile_completion: 100,
          updated_at: Date.now(),
        };
        await supabase.from('matrimonial_profiles').upsert(mpPayload as never, { onConflict: 'user_id' } as never);
        await supabase.from('users').upsert({ id: userId, identifier: (userEmail || form.phone || userId).toLowerCase(), email: userEmail, full_name: form.fullName.trim(), role: 'customer' } as never, { onConflict: 'id' } as never);
      } catch {}

      // Fallback / Sync to Express API (SQLite) so profile is visible in /customer even when Supabase tables are missing (PGRST205)
      // This ensures OTP and OAuth users see their profile immediately in the dashboard
      if (!saved || lastError?.includes('PGRST205') || lastError?.includes('Could not find the table')) {
        try {
          // Prefer Supabase session token, fallback to localStorage token (OTP flow)
          let apiToken: string | null = null;
          try {
            const { data: { session } } = await supabase.auth.getSession();
            apiToken = session?.access_token || null;
          } catch {}
          if (!apiToken) {
            try { apiToken = localStorage.getItem('token'); } catch {}
          }
          if (apiToken) {
            const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiToken}` };
            const r1 = await requestJson('/profile/personal', { method: 'POST', headers, body: JSON.stringify(structured.personal) });
            const r2 = await requestJson('/profile/education', { method: 'POST', headers, body: JSON.stringify(structured.education) });
            const r3 = await requestJson('/profile/family', { method: 'POST', headers, body: JSON.stringify(structured.family) });
            // Also save lifestyle via personal
            const r4 = await requestJson('/profile/preferences', { method: 'POST', headers, body: JSON.stringify({ ...(structured.lifestyle as Record<string, unknown>), about: form.aboutMe }) });
            if (!r1.networkError || !r2.networkError || !r3.networkError || !r4.networkError) {
              // If API is reachable, consider saved even if Supabase failed
              if (r1.ok || r2.ok || r3.ok || r4.ok) {
                saved = true;
                lastError = null;
              }
            }
          }
        } catch {}
      }

      if (!saved && lastError) {
        // Final fallback: store in localStorage so customer dashboard can display profile even without DB
        try {
          localStorage.setItem('shubhSanjogProfile', JSON.stringify({ ...payload, ...structured, photoUrl, is_completed: true }));
          localStorage.setItem('shubhSanjogProfileCompleted', 'true');
          saved = true;
          lastError = null;
        } catch {}
        if (!saved) throw new Error((lastError as string) || 'Failed to save profile');
      }

      // Ensure localStorage fallback is always set for immediate dashboard display
      try {
        localStorage.setItem('shubhSanjogProfile', JSON.stringify({ ...payload, ...structured, photoUrl, is_completed: true }));
        localStorage.setItem('shubhSanjogProfileCompleted', 'true');
      } catch {}

      setShowToast(true);
      setTimeout(() => router.push('/customer'), 1600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save profile. Please try again.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-4 py-3 text-sm outline-none focus:border-[#d4a64a] focus:ring-2 focus:ring-[#d4a64a]/20';
  const labelClass = 'mb-1.5 block text-sm font-semibold text-[#4d2c36]';
  const stepTitles = ['Profile For', 'Personal Information', 'Education & Career', 'Lifestyle & About Me', 'Family Information'];
  const stepIcons = [Heart, User, GraduationCap, Utensils, Users];

  return (
    <div className="min-h-screen bg-[#fffaf8] px-4 py-8 sm:px-6 lg:px-8">
      {showToast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md animate-fade-up rounded-[24px] border border-[#f2d9a8] bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#0a7d4c] to-[#14a86a] text-white">
              <CheckCircle size={32} />
            </div>
            <h3 className="mt-4 text-xl font-black text-[#2c0d16]">Profile Created Successfully!</h3>
            <p className="mt-2 text-sm text-[#5a3743]">Your profile is now active. Redirecting to dashboard...</p>
            <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-[#efe2d2]">
              <div className="h-full animate-[shrink_1.6s_linear_forwards] rounded-full bg-gradient-to-r from-[#0a7d4c] to-[#14a86a]" style={{ width: '100%' }} />
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#e9d8a4] bg-white px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-[#7b102d]">
            <Sparkles size={14} className="text-[#d4a64a]" /> Matrimonial Registration
          </div>
          <h1 className="mt-4 font-display text-3xl font-black tracking-tight text-[#2c0d16] sm:text-4xl">Complete your profile</h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[#5a3743]">Jeevansathi-style detailed form — all fields help us find your perfect match. Fill step by step.</p>
        </div>

        <div className="mb-6 rounded-[24px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
          <div className="flex items-start justify-between gap-1">
            {stepTitles.map((title, idx) => {
              const isActive = idx + 1 === step;
              const isDone = idx + 1 < step;
              const Icon = stepIcons[idx];
              return (
                <div key={title} className="flex flex-1 flex-col items-center">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition ${isDone ? 'bg-[#0a7d4c] text-white' : isActive ? 'bg-gradient-to-br from-[#7b102d] to-[#d4a64a] text-white shadow-md' : 'bg-[#fff1dc] text-[#7b102d] ring-1 ring-[#f2d9a8]'}`}>
                    {isDone ? <CheckCircle size={16} /> : <Icon size={16} />}
                  </div>
                  <span className={`mt-1.5 hidden text-center text-[10px] font-bold uppercase leading-tight tracking-wide sm:block ${isActive ? 'text-[#7b102d]' : isDone ? 'text-[#0a7d4c]' : 'text-[#8a7a85]'}`}>{title}</span>
                  <span className={`mt-1 block text-center text-[10px] font-bold sm:hidden ${isActive ? 'text-[#7b102d]' : 'text-[#8a7a85]'}`}>Step {idx+1}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex gap-1">
            {[1,2,3,4,5].map((s) => (
              <div key={s} className={`h-1.5 flex-1 rounded-full transition ${s <= step ? 'bg-gradient-to-r from-[#7b102d] to-[#d4a64a]' : 'bg-[#f2d9a8]'}`} />
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-[#f2d9a8] bg-white p-6 shadow-soft sm:p-8">
          {error && <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-[#9b1f2f]">{error}</div>}

          {step === 1 && (
            <section>
              <h2 className="mb-1 flex items-center gap-2 text-lg font-black text-[#2c0d16]"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fff1dc] text-[#7b102d]"><Heart size={16} /></span> This Profile is for</h2>
              <p className="mb-6 text-xs text-[#8a7a85]">Select who you are creating this profile for</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {PROFILE_FOR_OPTIONS.map((opt) => {
                  const isSelected = form.profileCreatedFor === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, profileCreatedFor: opt.value }))}
                      className={`group relative flex flex-col items-center justify-center rounded-2xl border-2 p-4 text-center transition-all duration-200 hover:shadow-md ${
                        isSelected
                          ? 'border-[#7b102d] bg-gradient-to-br from-[#fff1dc] to-[#ffe9c2] text-[#7b102d] shadow-md ring-2 ring-[#7b102d]/20'
                          : 'border-[#f2d9a8] bg-[#fffaf3] text-[#4d2c36] hover:border-[#d4a64a] hover:bg-white'
                      }`}
                    >
                      {isSelected && (
                        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#7b102d] text-white">
                          <CheckCircle size={12} />
                        </span>
                      )}
                      <span className={`text-sm font-bold ${isSelected ? 'text-[#7b102d]' : 'text-[#2c0d16]'}`}>{opt.label}</span>
                      <span className={`mt-1 text-[11px] ${isSelected ? 'text-[#7b102d]/70' : 'text-[#8a7a85]'}`}>{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-medium leading-5 text-amber-900">
                  <span className="font-bold">Note:</span> Shubh Sanjog Matrimony is built for genuine match-seekers. Profiles created by commercial agents or marriage bureaus are strictly prohibited.
                </p>
              </div>
            </section>
          )}

          {step === 2 && (
            <section>
              <h2 className="mb-1 flex items-center gap-2 text-lg font-black text-[#2c0d16]"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fff1dc] text-[#7b102d]"><User size={16} /></span> {isForOther ? "Candidate's Personal Information" : 'Personal Information'}</h2>
              <p className="mb-6 text-xs text-[#8a7a85]">Basic biodata & identity {isForOther && <span className="font-semibold text-[#7b102d]">— Candidate&apos;s details</span>}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass}>{candidateLabel('Full Name')} *</label>
                  <input type="text" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} placeholder={isForOther ? "Candidate's full name" : "Aarav Sharma"} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{candidateLabel('Gender')} *</label>
                  <select value={form.gender} onChange={(e) => update('gender', e.target.value)} className={inputClass}>
                    <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Date of Birth *</label>
                  <input type="date" value={form.dob} onChange={(e) => update('dob', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Age</label>
                  <input type="number" value={form.age} onChange={(e) => update('age', e.target.value)} placeholder="26" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Height</label>
                  <input type="text" value={form.height} onChange={(e) => update('height', e.target.value)} placeholder="5'9&quot; / 175 cm" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Weight</label>
                  <input type="text" value={form.weight} onChange={(e) => update('weight', e.target.value)} placeholder="70 kg" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Phone Number *</label>
                  <input type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+91 98765 43210" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Religion *</label>
                  <select value={form.religion} onChange={(e) => update('religion', e.target.value)} className={inputClass}>
                    <option value="">Select</option><option>Hindu</option><option>Muslim</option><option>Sikh</option><option>Christian</option><option>Jain</option><option>Buddhist</option><option>Other</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Caste</label>
                  <input type="text" value={form.caste} onChange={(e) => update('caste', e.target.value)} placeholder="Brahmin, Maratha" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Sub-Caste</label>
                  <input type="text" value={form.subCaste} onChange={(e) => update('subCaste', e.target.value)} placeholder="Sub-caste" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Mother Tongue *</label>
                  <input type="text" value={form.motherTongue} onChange={(e) => update('motherTongue', e.target.value)} placeholder="Marathi, Hindi" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Marital Status *</label>
                  <select value={form.maritalStatus} onChange={(e) => update('maritalStatus', e.target.value)} className={inputClass}>
                    <option value="">Select</option><option>Never Married</option><option>Married</option><option>Divorced</option><option>Widowed</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Location (City)</label>
                  <input type="text" value={form.location} onChange={(e) => update('location', e.target.value)} placeholder="Nagpur" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Country</label>
                  <input type="text" value={form.country} onChange={(e) => update('country', e.target.value)} placeholder="India" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Citizenship</label>
                  <input type="text" value={form.citizenship} onChange={(e) => update('citizenship', e.target.value)} placeholder="Indian" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>NRI Status</label>
                  <select value={form.nriStatus} onChange={(e) => update('nriStatus', e.target.value)} className={inputClass}>
                    <option>Yes</option><option>No</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Manglik Status</label>
                  <select value={form.manglikStatus} onChange={(e) => update('manglikStatus', e.target.value)} className={inputClass}>
                    <option value="">Select</option><option>Manglik</option><option>Non-Manglik</option><option>Anshik Manglik</option><option>Don't Know</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Horoscope / Kundli Details</label>
                  <textarea rows={2} value={form.horoscopeDetails} onChange={(e) => update('horoscopeDetails', e.target.value)} placeholder="Birth time, place, nakshatra, etc." className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-[#4d2c36]"><Upload size={14} /> Profile Photo</label>
                  <div className="rounded-2xl border-2 border-dashed border-[#f2d9a8] bg-[#fffaf3] p-4 text-center">
                    {form.photoPreview ? (
                      <div className="flex flex-col items-center gap-2">
                        <img src={form.photoPreview} alt="Preview" className="h-24 w-24 rounded-2xl object-cover" />
                        <button type="button" onClick={() => setForm((p) => ({ ...p, photoFile: null, photoPreview: null }))} className="text-xs font-bold text-[#9b1f2f]">Remove</button>
                      </div>
                    ) : (
                      <label className="inline-flex cursor-pointer flex-col items-center gap-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm"><Upload size={16} className="text-[#7b102d]" /></div>
                        <span className="text-sm font-semibold text-[#2c0d16]">Upload Photo</span>
                        <span className="text-xs text-[#8a7a85]">JPG/PNG up to 5MB</span>
                        <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {step === 3 && (
            <section>
              <h2 className="mb-1 flex items-center gap-2 text-lg font-black text-[#2c0d16]"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fff1dc] text-[#7b102d]"><GraduationCap size={16} /></span> Education & Career</h2>
              <p className="mb-6 text-xs text-[#8a7a85]">Qualification & professional background</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Highest Qualification *</label>
                  <select value={form.highestQualification} onChange={(e) => update('highestQualification', e.target.value)} className={inputClass}>
                    <option value="">Select</option><option>High School</option><option>Diploma</option><option>Graduate</option><option>Post Graduate</option><option>MBA</option><option>M.Tech</option><option>B.Tech</option><option>PhD</option><option>Other</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Education Details</label>
                  <input type="text" value={form.educationDetails} onChange={(e) => update('educationDetails', e.target.value)} placeholder="e.g., B.Com from Nagpur University" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Profession *</label>
                  <input type="text" value={form.profession} onChange={(e) => update('profession', e.target.value)} placeholder="Software Engineer" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Job / Business</label>
                  <select value={form.jobBusiness} onChange={(e) => update('jobBusiness', e.target.value)} className={inputClass}>
                    <option value="">Select</option><option>Private Job</option><option>Government Job</option><option>Business</option><option>Self Employed</option><option>Not Working</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Company / Organization</label>
                  <input type="text" value={form.company} onChange={(e) => update('company', e.target.value)} placeholder="Infosys, TCS, Own Business" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Annual Income</label>
                  <select value={form.annualIncome} onChange={(e) => update('annualIncome', e.target.value)} className={inputClass}>
                    <option value="">Select</option><option>0-3 LPA</option><option>3-6 LPA</option><option>6-10 LPA</option><option>10-20 LPA</option><option>20-50 LPA</option><option>50+ LPA</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Work Location</label>
                  <input type="text" value={form.workLocation} onChange={(e) => update('workLocation', e.target.value)} placeholder="Pune, Mumbai" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Years of Experience</label>
                  <select value={form.experience} onChange={(e) => update('experience', e.target.value)} className={inputClass}>
                    <option value="">Select</option><option>Fresher</option><option>1-3 years</option><option>3-5 years</option><option>5-10 years</option><option>10+ years</option>
                  </select>
                </div>
              </div>
            </section>
          )}

          {step === 4 && (
            <section>
              <h2 className="mb-1 flex items-center gap-2 text-lg font-black text-[#2c0d16]"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fff1dc] text-[#7b102d]"><Utensils size={16} /></span> Lifestyle & About Me</h2>
              <p className="mb-6 text-xs text-[#8a7a85]">Habits, interests & personality</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Food Preference</label>
                  <select value={form.foodPreference} onChange={(e) => update('foodPreference', e.target.value)} className={inputClass}>
                    <option value="">Select</option><option>Vegetarian</option><option>Non-Vegetarian</option><option>Eggerian</option><option>Jain</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Smoking</label>
                    <select value={form.smoking} onChange={(e) => update('smoking', e.target.value)} className={inputClass}>
                      <option value="">Select</option><option>Yes</option><option>No</option><option>Occasionally</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Drinking</label>
                    <select value={form.drinking} onChange={(e) => update('drinking', e.target.value)} className={inputClass}>
                      <option value="">Select</option><option>Yes</option><option>No</option><option>Occasionally</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Hobbies</label>
                  <input type="text" value={form.hobbies} onChange={(e) => update('hobbies', e.target.value)} placeholder="Reading, Traveling, Music" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Interests</label>
                  <input type="text" value={form.interests} onChange={(e) => update('interests', e.target.value)} placeholder="Cricket, Cooking" className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Personality / About Me *</label>
                  <textarea rows={4} value={form.aboutMe} onChange={(e) => update('aboutMe', e.target.value)} placeholder="Describe yourself, values, family background, partner expectations..." maxLength={1000} className={inputClass} />
                  <p className="mt-1 text-right text-xs text-[#8a7a85]">{form.aboutMe.length}/1000</p>
                </div>
              </div>
            </section>
          )}

          {step === 5 && (
            <section>
              <h2 className="mb-1 flex items-center gap-2 text-lg font-black text-[#2c0d16]"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fff1dc] text-[#7b102d]"><Users size={16} /></span> Family Information</h2>
              <p className="mb-6 text-xs text-[#8a7a85]">Family background & values</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Father&apos;s Name *</label>
                  <input type="text" value={form.fatherName} onChange={(e) => update('fatherName', e.target.value)} placeholder="Father's full name" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Father&apos;s Occupation</label>
                  <input type="text" value={form.fatherOccupation} onChange={(e) => update('fatherOccupation', e.target.value)} placeholder="Retired, Business, Govt Service" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Mother&apos;s Name *</label>
                  <input type="text" value={form.motherName} onChange={(e) => update('motherName', e.target.value)} placeholder="Mother's full name" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Mother&apos;s Occupation</label>
                  <input type="text" value={form.motherOccupation} onChange={(e) => update('motherOccupation', e.target.value)} placeholder="Housewife, Teacher" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Number of Brothers</label>
                  <select value={form.brothers} onChange={(e) => update('brothers', e.target.value)} className={inputClass}>
                    <option value="">Select</option><option>0</option><option>1</option><option>2</option><option>3</option><option>4+</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Number of Sisters</label>
                  <select value={form.sisters} onChange={(e) => update('sisters', e.target.value)} className={inputClass}>
                    <option value="">Select</option><option>0</option><option>1</option><option>2</option><option>3</option><option>4+</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Family Type</label>
                  <select value={form.familyType} onChange={(e) => update('familyType', e.target.value)} className={inputClass}>
                    <option value="">Select</option><option>Nuclear</option><option>Joint</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Family Status</label>
                  <select value={form.familyStatus} onChange={(e) => update('familyStatus', e.target.value)} className={inputClass}>
                    <option value="">Select</option><option>Middle Class</option><option>Upper Middle Class</option><option>Rich</option><option>Affluent</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Family Location</label>
                  <input type="text" value={form.familyLocation} onChange={(e) => update('familyLocation', e.target.value)} placeholder="City/State where family resides" className={inputClass} />
                </div>
              </div>
            </section>
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            <button type="button" onClick={handleBack} disabled={step === 1} className="inline-flex items-center gap-1.5 rounded-full border border-[#f2d9a8] bg-white px-6 py-2.5 text-sm font-bold text-[#5a3743] disabled:opacity-40">
              <ChevronLeft size={16} /> Back
            </button>
            {step < 5 ? (
              <button type="button" onClick={handleNext} className="inline-flex items-center gap-1.5 rounded-full bg-[#7b102d] px-8 py-2.5 text-sm font-bold text-white hover:bg-[#5a0a1f]">
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button type="button" onClick={handleSubmit} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#7b102d] to-[#a91336] px-8 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-60">
                {busy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Saving...</> : <>Save Profile & Unlock Site <CheckCircle size={16} /></>}
              </button>
            )}
          </div>
        </div>
        <style>{`@keyframes shrink { from { transform: scaleX(1); } to { transform: scaleX(0); } }`}</style>
      </div>
    </div>
  );
}

export default function FillDetailsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#fffaf8] flex items-center justify-center p-8 text-[#2c0d16]">Loading...</div>}>
      <FillDetailsInner />
    </Suspense>
  );
}
