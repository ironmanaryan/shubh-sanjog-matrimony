'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, User, Heart, GraduationCap, MapPin, Upload, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';

type FormState = {
  fullName: string;
  gender: string;
  dob: string;
  phone: string;
  religion: string;
  caste: string;
  motherTongue: string;
  maritalStatus: string;
  qualification: string;
  occupation: string;
  annualIncome: string;
  city: string;
  state: string;
  about: string;
  photoFile: File | null;
  photoPreview: string | null;
};

const initialForm: FormState = {
  fullName: '',
  gender: '',
  dob: '',
  phone: '',
  religion: '',
  caste: '',
  motherTongue: '',
  maritalStatus: '',
  qualification: '',
  occupation: '',
  annualIncome: '',
  city: '',
  state: '',
  about: '',
  photoFile: null,
  photoPreview: null,
};

function FillDetailsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStep = parseInt(searchParams.get('step') || '1', 10);
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), 4));
  const [form, setForm] = useState<FormState>(initialForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const s = parseInt(searchParams.get('step') || '1', 10);
    if (!isNaN(s) && s >= 1 && s <= 4) setStep(s);
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
      // Prefill full name from user metadata if available
      const metaName = (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || '';
      if (metaName) {
        setForm((prev) => ({ ...prev, fullName: prev.fullName || metaName }));
      }
      // Try to fetch existing profile to prefill
      try {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .or(`id.eq.${user.id},user_id.eq.${user.id}`)
          .maybeSingle();
        if (data) {
          const d = data as Record<string, unknown>;
          setForm((prev) => ({
            ...prev,
            fullName: (d['full_name'] as string) || (d['fullName'] as string) || prev.fullName,
            gender: (d['gender'] as string) || prev.gender,
            dob: (d['dob'] as string) || (d['date_of_birth'] as string) || prev.dob,
            phone: (d['phone'] as string) || (d['phone_number'] as string) || prev.phone,
            religion: (d['religion'] as string) || prev.religion,
            caste: (d['caste'] as string) || prev.caste,
            motherTongue: (d['mother_tongue'] as string) || (d['motherTongue'] as string) || prev.motherTongue,
            maritalStatus: (d['marital_status'] as string) || (d['maritalStatus'] as string) || prev.maritalStatus,
            qualification: (d['qualification'] as string) || prev.qualification,
            occupation: (d['occupation'] as string) || prev.occupation,
            annualIncome: (d['annual_income'] as string) || (d['annualIncome'] as string) || prev.annualIncome,
            city: (d['city'] as string) || prev.city,
            state: (d['state'] as string) || prev.state,
            about: (d['about'] as string) || (d['bio'] as string) || (d['about_myself'] as string) || prev.about,
          }));
        }
      } catch {}
      // Fallback: check by id only
      try {
        const supa = getSupabase();
        if (!supa) return;
        const { data: byId } = await supa.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (byId) {
          const d = byId as Record<string, unknown>;
          setForm((prev) => ({
            ...prev,
            fullName: (d['full_name'] as string) || prev.fullName,
            gender: (d['gender'] as string) || prev.gender,
          }));
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
      if (!form.fullName.trim()) { setError('Please enter your full name.'); return false; }
      if (!form.gender) { setError('Please select gender.'); return false; }
      if (!form.dob) { setError('Please select date of birth.'); return false; }
      if (!form.phone.trim() || !/^[+]?[\d\s-]{10,15}$/.test(form.phone.trim())) { setError('Please enter a valid phone number.'); return false; }
    }
    if (step === 2) {
      if (!form.religion) { setError('Please select religion.'); return false; }
      if (!form.motherTongue) { setError('Please enter mother tongue.'); return false; }
      if (!form.maritalStatus) { setError('Please select marital status.'); return false; }
    }
    if (step === 3) {
      if (!form.qualification) { setError('Please select qualification.'); return false; }
      if (!form.occupation.trim()) { setError('Please enter occupation.'); return false; }
      if (!form.annualIncome) { setError('Please select annual income.'); return false; }
    }
    if (step === 4) {
      if (!form.city.trim()) { setError('Please enter city.'); return false; }
      if (!form.state.trim()) { setError('Please enter state.'); return false; }
      if (!form.about.trim()) { setError('Please write about yourself.'); return false; }
    }
    setError('');
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    if (step < 4) {
      const nextStep = step + 1;
      setStep(nextStep);
      router.push(`/register/fill-details?step=${nextStep}`);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      const prev = step - 1;
      setStep(prev);
      router.push(`/register/fill-details?step=${prev}`);
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
      if (form.photoFile) {
        try {
          const filePath = `${userId}/${Date.now()}-${form.photoFile.name}`;
          const { error: uploadError } = await supabase.storage.from('profiles').upload(filePath, form.photoFile, { upsert: true });
          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('profiles').getPublicUrl(filePath);
            photoUrl = urlData.publicUrl;
          } else {
            // Try alternate bucket "avatars"
            const { error: err2 } = await supabase.storage.from('avatars').upload(filePath, form.photoFile, { upsert: true });
            if (!err2) {
              const { data: urlData2 } = supabase.storage.from('avatars').getPublicUrl(filePath);
              photoUrl = urlData2.publicUrl;
            }
          }
        } catch (e) {
          console.warn('photo upload failed', e);
        }
      }

      const nowIso = new Date().toISOString();
      const payload: Record<string, unknown> = {
        id: userId,
        user_id: userId,
        full_name: form.fullName.trim(),
        gender: form.gender,
        dob: form.dob,
        date_of_birth: form.dob,
        phone: form.phone.trim(),
        phone_number: form.phone.trim(),
        religion: form.religion,
        caste: form.caste.trim() || null,
        mother_tongue: form.motherTongue,
        marital_status: form.maritalStatus,
        qualification: form.qualification,
        occupation: form.occupation.trim(),
        annual_income: form.annualIncome,
        city: form.city.trim(),
        state: form.state.trim(),
        location: [form.city.trim(), form.state.trim()].filter(Boolean).join(', '),
        about: form.about.trim(),
        bio: form.about.trim(),
        about_myself: form.about.trim(),
        profile_photo: photoUrl,
        photo_url: photoUrl,
        avatar_url: photoUrl,
        email: userEmail,
        is_completed: true,
        completed_at: nowIso,
        updated_at: nowIso,
      };

      // Try upsert into profiles with id conflict
      let saved = false;
      let lastError: string | null = null;
      try {
        const { error } = await supabase.from('profiles').upsert(payload as never, { onConflict: 'id' } as never);
        if (!error) saved = true;
        else {
          lastError = (error as { message?: string }).message || 'Upsert failed';
          // Try user_id conflict
          const { error: e2 } = await supabase.from('profiles').upsert(payload as never, { onConflict: 'user_id' } as never);
          if (!e2) saved = true;
          else lastError = (e2 as { message?: string }).message || lastError;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }

      // If profiles save failed due to missing column, try minimal payload
      if (!saved) {
        try {
          const minimal: Record<string, unknown> = {
            id: userId,
            user_id: userId,
            full_name: form.fullName.trim(),
            gender: form.gender,
            dob: form.dob,
            phone: form.phone.trim(),
            religion: form.religion,
            caste: form.caste,
            mother_tongue: form.motherTongue,
            marital_status: form.maritalStatus,
            qualification: form.qualification,
            occupation: form.occupation,
            annual_income: form.annualIncome,
            city: form.city,
            state: form.state,
            about: form.about,
            is_completed: true,
          };
          if (photoUrl) {
            (minimal as Record<string, unknown>)['photo_url'] = photoUrl;
            (minimal as Record<string, unknown>)['profile_photo'] = photoUrl;
          }
          const { error: e3 } = await supabase.from('profiles').upsert(minimal as never, { onConflict: 'id' } as never);
          if (!e3) saved = true;
          else lastError = (e3 as { message?: string }).message || lastError;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
      }

      // Also ensure matrimonial_profiles is updated for legacy dashboard compatibility
      try {
        const [firstName, ...rest] = form.fullName.trim().split(' ');
        const lastName = rest.join(' ') || '';
        const mpPayload: Record<string, unknown> = {
          user_id: userId,
          personal: {
            firstName: firstName || form.fullName,
            lastName,
            gender: form.gender,
            dob: form.dob,
            religion: form.religion,
            caste: form.caste,
            motherTongue: form.motherTongue,
            maritalStatus: form.maritalStatus,
            city: form.city,
            state: form.state,
            mobile: form.phone,
            about: form.about,
            bio: form.about,
          },
          education: {
            highestQualification: form.qualification,
            profession: form.occupation,
            annualIncome: form.annualIncome,
          },
          status: 'Draft',
          updated_at: Date.now(),
        };
        await supabase.from('matrimonial_profiles').upsert(mpPayload as never, { onConflict: 'user_id' } as never);
        // Also ensure users table has entry
        await supabase.from('users').upsert({
          id: userId,
          identifier: (userEmail || form.phone || userId).toLowerCase(),
          email: userEmail,
          full_name: form.fullName.trim(),
          role: 'customer',
        } as never, { onConflict: 'id' } as never);
      } catch {}

      if (!saved && lastError) {
        console.error('profiles upsert failed', lastError);
        // Even if error, still show success for UX if fallback succeeded partially
        // Throw to show error
        throw new Error(lastError);
      }

      setShowToast(true);
      setTimeout(() => {
        router.push('/customer');
      }, 1800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save profile. Please try again.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const stepTitles = ['Basic Info', 'Personal Details', 'Career & Education', 'Location & Bio'];
  const stepIcons = [User, Heart, GraduationCap, MapPin];

  return (
    <div className="min-h-screen bg-[#fffaf8] px-4 py-8 sm:px-6 lg:px-8">
      {/* Toast Modal */}
      {showToast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md animate-fade-up rounded-[24px] border border-[#f2d9a8] bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#0a7d4c] to-[#14a86a] text-white">
              <CheckCircle size={32} />
            </div>
            <h3 className="mt-4 text-xl font-black text-[#2c0d16]">🎉 Profile Created Successfully! Your account is now fully active.</h3>
            <p className="mt-2 text-sm text-[#5a3743]">Welcome to Shubh Sanjog Matrimony — redirecting to your dashboard...</p>
            <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-[#efe2d2]">
              <div className="h-full animate-[shrink_1.8s_linear_forwards] rounded-full bg-gradient-to-r from-[#0a7d4c] to-[#14a86a]" style={{ width: '100%' }} />
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#e9d8a4] bg-white px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-[#7b102d]">
            <Sparkles size={14} className="text-[#d4a64a]" />
            Complete Your Profile
          </div>
          <h1 className="mt-4 font-display text-3xl font-black tracking-tight text-[#2c0d16] sm:text-4xl">Create your matrimony profile</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#5a3743]">Jeevansathi-style structured form — all steps are required to unlock the full site.</p>
        </div>

        {/* Progress */}
        <div className="mb-8 rounded-[24px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between">
            {stepTitles.map((title, idx) => {
              const isActive = idx + 1 === step;
              const isDone = idx + 1 < step;
              const Icon = stepIcons[idx];
              return (
                <div key={title} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition ${isDone ? 'bg-[#0a7d4c] text-white' : isActive ? 'bg-gradient-to-br from-[#7b102d] to-[#d4a64a] text-white shadow-md' : 'bg-[#fff1dc] text-[#7b102d] ring-1 ring-[#f2d9a8]'}`}>
                      {isDone ? <CheckCircle size={16} /> : <Icon size={16} />}
                    </div>
                    <span className={`hidden text-center text-[11px] font-bold uppercase tracking-wide sm:block ${isActive ? 'text-[#7b102d]' : isDone ? 'text-[#0a7d4c]' : 'text-[#8a7a85]'}`}>{title}</span>
                  </div>
                  {idx < stepTitles.length - 1 && (
                    <div className={`mx-2 h-0.5 flex-1 rounded-full transition ${isDone ? 'bg-[#0a7d4c]' : 'bg-[#f2d9a8]'}`} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#efe2d2]">
            <div className="h-full rounded-full bg-gradient-to-r from-[#7b102d] to-[#d4a64a] transition-all duration-500" style={{ width: `${(step / 4) * 100}%` }} />
          </div>
          <p className="mt-2 text-center text-xs font-semibold text-[#7b102d]">Step {step} of 4: {stepTitles[step - 1]}</p>
        </div>

        <div className="rounded-[24px] border border-[#f2d9a8] bg-white p-6 shadow-soft sm:p-8">
          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-[#9b1f2f]">{error}</div>
          )}

          {step === 1 && (
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-[#2c0d16]">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fff1dc] text-[#7b102d]"><User size={16} /></span>
                Basic Info
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">Full Name *</label>
                  <input type="text" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} placeholder="Aarav Sharma" className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-4 py-3 text-sm outline-none focus:border-[#d4a64a] focus:ring-2 focus:ring-[#d4a64a]/20" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">Gender *</label>
                  <select value={form.gender} onChange={(e) => update('gender', e.target.value)} className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-4 py-3 text-sm outline-none focus:border-[#d4a64a]">
                    <option value="">Select gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">Date of Birth *</label>
                  <input type="date" value={form.dob} onChange={(e) => update('dob', e.target.value)} className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-4 py-3 text-sm outline-none focus:border-[#d4a64a]" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">Phone Number *</label>
                  <input type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+91 98765 43210" className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-4 py-3 text-sm outline-none focus:border-[#d4a64a]" />
                </div>
              </div>
            </section>
          )}

          {step === 2 && (
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-[#2c0d16]">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fff1dc] text-[#7b102d]"><Heart size={16} /></span>
                Personal Details
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">Religion *</label>
                  <select value={form.religion} onChange={(e) => update('religion', e.target.value)} className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-4 py-3 text-sm outline-none focus:border-[#d4a64a]">
                    <option value="">Select religion</option>
                    <option value="Hindu">Hindu</option>
                    <option value="Muslim">Muslim</option>
                    <option value="Sikh">Sikh</option>
                    <option value="Christian">Christian</option>
                    <option value="Jain">Jain</option>
                    <option value="Buddhist">Buddhist</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">Caste</label>
                  <input type="text" value={form.caste} onChange={(e) => update('caste', e.target.value)} placeholder="Brahmin, Maratha, etc." className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-4 py-3 text-sm outline-none focus:border-[#d4a64a]" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">Mother Tongue *</label>
                  <input type="text" value={form.motherTongue} onChange={(e) => update('motherTongue', e.target.value)} placeholder="Marathi, Hindi, English" className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-4 py-3 text-sm outline-none focus:border-[#d4a64a]" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">Marital Status *</label>
                  <select value={form.maritalStatus} onChange={(e) => update('maritalStatus', e.target.value)} className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-4 py-3 text-sm outline-none focus:border-[#d4a64a]">
                    <option value="">Select status</option>
                    <option value="Never Married">Never Married</option>
                    <option value="Married">Married</option>
                    <option value="Divorced">Divorced</option>
                    <option value="Widowed">Widowed</option>
                  </select>
                </div>
              </div>
            </section>
          )}

          {step === 3 && (
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-[#2c0d16]">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fff1dc] text-[#7b102d]"><GraduationCap size={16} /></span>
                Career & Education
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">Qualification *</label>
                  <select value={form.qualification} onChange={(e) => update('qualification', e.target.value)} className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-4 py-3 text-sm outline-none focus:border-[#d4a64a]">
                    <option value="">Select qualification</option>
                    <option value="High School">High School</option>
                    <option value="Graduate">Graduate</option>
                    <option value="Post Graduate">Post Graduate</option>
                    <option value="MBA">MBA</option>
                    <option value="M.Tech">M.Tech</option>
                    <option value="B.Tech">B.Tech</option>
                    <option value="PhD">PhD</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">Occupation *</label>
                  <input type="text" value={form.occupation} onChange={(e) => update('occupation', e.target.value)} placeholder="Software Engineer, Doctor" className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-4 py-3 text-sm outline-none focus:border-[#d4a64a]" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">Annual Income *</label>
                  <select value={form.annualIncome} onChange={(e) => update('annualIncome', e.target.value)} className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-4 py-3 text-sm outline-none focus:border-[#d4a64a]">
                    <option value="">Select income</option>
                    <option value="0-3 LPA">0-3 LPA</option>
                    <option value="3-6 LPA">3-6 LPA</option>
                    <option value="6-10 LPA">6-10 LPA</option>
                    <option value="10-20 LPA">10-20 LPA</option>
                    <option value="20+ LPA">20+ LPA</option>
                  </select>
                </div>
              </div>
            </section>
          )}

          {step === 4 && (
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-[#2c0d16]">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fff1dc] text-[#7b102d]"><MapPin size={16} /></span>
                Location & Bio
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">City *</label>
                  <input type="text" value={form.city} onChange={(e) => update('city', e.target.value)} placeholder="Nagpur" className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-4 py-3 text-sm outline-none focus:border-[#d4a64a]" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">State *</label>
                  <input type="text" value={form.state} onChange={(e) => update('state', e.target.value)} placeholder="Maharashtra" className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-4 py-3 text-sm outline-none focus:border-[#d4a64a]" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-semibold text-[#4d2c36]">About Myself *</label>
                  <textarea rows={4} value={form.about} onChange={(e) => update('about', e.target.value)} placeholder="Share your values, interests, family background..." maxLength={1000} className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-4 py-3 text-sm outline-none focus:border-[#d4a64a]" />
                  <p className="mt-1 text-right text-xs text-[#8a7a85]">{form.about.length}/1000</p>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-[#4d2c36]"><Upload size={14} /> Profile Photo</label>
                  <div className="rounded-2xl border-2 border-dashed border-[#f2d9a8] bg-[#fffaf3] p-6 text-center">
                    {form.photoPreview ? (
                      <div className="flex flex-col items-center gap-3">
                        <img src={form.photoPreview} alt="Preview" className="h-28 w-28 rounded-2xl object-cover shadow-md" />
                        <p className="text-xs font-medium text-[#0a7d4c]">{form.photoFile?.name}</p>
                        <button type="button" onClick={() => setForm((p) => ({ ...p, photoFile: null, photoPreview: null }))} className="text-xs font-bold text-[#9b1f2f]">Remove</button>
                      </div>
                    ) : (
                      <>
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm"><Upload size={18} className="text-[#7b102d]" /></div>
                        <p className="mt-3 text-sm font-semibold text-[#2c0d16]">Upload profile photo</p>
                        <p className="mt-1 text-xs text-[#6b5a64]">JPG, PNG up to 5MB</p>
                        <label className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-full bg-[#7b102d] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#5a0a1f]">
                          Choose Photo
                          <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                        </label>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            <button type="button" onClick={handleBack} disabled={step === 1} className="inline-flex items-center gap-1.5 rounded-full border border-[#f2d9a8] bg-white px-6 py-2.5 text-sm font-bold text-[#5a3743] disabled:opacity-40">
              <ChevronLeft size={16} /> Back
            </button>
            {step < 4 ? (
              <button type="button" onClick={handleNext} className="inline-flex items-center gap-1.5 rounded-full bg-[#7b102d] px-8 py-2.5 text-sm font-bold text-white hover:bg-[#5a0a1f]">
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button type="button" onClick={handleSubmit} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#7b102d] to-[#a91336] px-8 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-60">
                {busy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Saving...</> : <><CheckCircle size={16} /> Submit & Create Profile</>}
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
