'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BriefcaseBusiness, CheckCheck, ChevronRight, Circle, CircleCheckBig, CreditCard, FileText, GraduationCap, Heart, Home, MessageSquare, ShieldCheck, Sparkles, User, UserRound, Users, Wallet } from 'lucide-react';
import PrivacySettings from '../../components/customer/PrivacySettings';
import RequestMeetingButton from '@/components/customer/RequestMeetingButton';
import DocumentBadges from '@/components/customer/DocumentBadges';
import MembershipExpiryBanner from '@/components/customer/MembershipExpiryBanner';
import NotificationsPanel from '@/components/customer/NotificationsPanel';
import { compatibilityBadgeClass } from '@/lib/compatibility';
import { buildMeetingRequestMessage } from '@/lib/whatsapp';
import { API, requestJson } from '@/lib/api-client';
import { getSupabase } from '@/lib/supabase';
import { compressAvatar, formatBytes } from '@/lib/image-compress';

// Customer panel sections from the reference scope document

// Narrow `select()` on the three profile lookups below — `profiles` carries
// JSONB sections and attachment columns that we never read here. The list
// mirrors what the dashboard actually renders and only includes columns that
// exist in supabase/profiles_migration.sql. Previously this list contained
// typos like `udinary_url`/`ary_url` and camelCase duplicates (e.g. `fullName`,
// `subCaste`, `cloudinary_url` which lives in `documents`/`payments`, not
// `profiles`) causing 400 Bad Request from PostgREST. We now select only
// valid snake_case columns and fallback gracefully for avatar fields.
const PROFILE_DISPLAY_COLUMNS = [
  'full_name', 'gender', 'dob', 'date_of_birth', 'age',
  'height', 'weight',
  'religion', 'caste', 'sub_caste',
  'mother_tongue', 'marital_status',
  'location', 'city', 'country', 'citizenship',
  'nri_status', 'manglik_status',
  'horoscope_details',
  'phone', 'phone_number',
  'highest_qualification', 'qualification',
  'education_details',
  'profession',
  'job_business', 'company', 'organization',
  'annual_income', 'work_location',
  'experience', 'years_of_experience',
  'food_preference', 'smoking', 'drinking',
  'hobbies', 'interests',
  'about', 'about_me', 'bio', 'personality',
  'father_name', 'father_occupation',
  'mother_name', 'mother_occupation',
  'brothers', 'sisters', 'number_of_brothers', 'number_of_sisters',
  'family_type', 'family_status', 'family_location',
  'photo_url', 'avatar_url', 'profile_photo', 'personal',
  'email', 'is_completed',
].join(',');

const navItems = [
  { label: 'Profile Dashboard', icon: Home, href: '/customer' },
  { label: 'Matrimonial Profile', icon: UserRound, href: '/customer/biodata' },
  { label: 'Family Details', icon: UsersIcon, href: '/customer/biodata' },
  { label: 'Partner Preferences', icon: Heart, href: '/customer/biodata' },
  { label: 'Documents', icon: FileText, href: '/customer/documents' },
  { label: 'Horoscope / Kundli', icon: Sparkles, href: '/customer/documents' },
  { label: 'Recommended Matches', icon: CheckCheck, href: '/customer/recommended' },
  { label: 'Membership', icon: Wallet, href: '/customer/membership' },
  { label: 'Payments', icon: CreditCard, href: '/customer/membership' },
  { label: 'Appointments', icon: BriefcaseBusiness, href: '/customer/appointments' },
  { label: 'Notifications', icon: Bell, href: '#notifications' },
  { label: 'Profile Activity', icon: MessageSquare, href: '/customer/activity' },
  { label: 'Account Settings', icon: ShieldCheck, href: '/customer/settings' },
];

type PersonalInfo = {
  firstName?: string;
  lastName?: string;
  gender?: string;
  dob?: string;
  height?: string;
  religion?: string;
  caste?: string;
  subCaste?: string;
  motherTongue?: string;
  maritalStatus?: string;
  city?: string;
  state?: string;
  mobile?: string;
  email?: string;
};

type ProfileData = {
  personal?: PersonalInfo;
  education?: {
    highestQualification?: string;
    profession?: string;
    company?: string;
    annualIncome?: string;
    workLocation?: string;
  };
  // Family structure schema (scope PDF §6): parents' occupations, siblings,
  // family type/status/location.
  family?: {
    fatherName?: string;
    motherName?: string;
    fatherOccupation?: string;
    motherOccupation?: string;
    numberOfBrothers?: number | string;
    numberOfSisters?: number | string;
    familyType?: string;
    familyStatus?: string;
    familyLocation?: string;
    otherInfo?: string;
  };
  preferences?: {
    preferredGender?: string;
    minAge?: number | string;
    maxAge?: number | string;
    religion?: string;
    caste?: string;
    location?: string;
  };
  profileCompletion?: number;
  status?: string;
};

type Appointment = { id?: string; date: string; time: string; type?: string; notes?: string; status?: string };

type DocumentItem = { id: string; status?: string; documentType?: string | null; originalName?: string };

// Shape that DocumentBadges accepts; looser than DocumentItem so the badge
// component can be reused on a public profile too without pulling in the full
// customer dashboard type graph.
type DocumentLike = { documentType?: string | null | undefined; status?: string | null | undefined };

type NotificationItem = { id: string; type: string; at: number; payload?: string | Record<string, unknown> | null };

// Compatibility highlight card (PRD high-priority #1) — mirrors the
// /matches/search result shape; matchScore is computed server-side against
// the viewer's saved partner preferences.
type MatchHighlight = {
  id: string;
  name: string;
  age?: number | null;
  city?: string;
  profession?: string;
  matchScore?: number;
  matchReasons?: string;
  verifiedBadge?: boolean;
};

type MembershipSummary = {
  tier?: string;
  active?: boolean;
  startedAt?: number | null;
  expiresAt?: number | null;
  meetingsAllowed?: number;
  meetingsUsed?: number;
  meetingsLeft?: number;
  profilesAllowed?: number;
  profilesShared?: number;
  profilesRemaining?: number;
};

const defaultProfile: ProfileData = {
  personal: {},
  education: {},
  family: {},
  preferences: {},
  profileCompletion: 0,
};

function UsersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" />
      <path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M20 19v-1a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

// Client-side mirror of the server's calculateProfileCompletion (scope PDF §5-§6)
// covering personal, education & career, lifestyle, family structure
// (father/mother occupation, siblings, family status…) and partner preferences.
// Keeps the dashboard's completion badge dynamic even when the stats endpoint
// is unreachable or returns a stale score.
const COMPLETION_FIELDS: Record<string, string[]> = {
  personal: ['firstName', 'lastName', 'gender', 'dob', 'height', 'weight', 'religion', 'caste', 'subCaste', 'motherTongue', 'maritalStatus', 'city', 'state', 'country', 'citizenship', 'nriStatus', 'manglikStatus'],
  education: ['highestQualification', 'educationDetails', 'profession', 'jobType', 'company', 'annualIncome', 'workLocation', 'experience'],
  family: ['fatherName', 'fatherOccupation', 'motherName', 'motherOccupation', 'numberOfBrothers', 'numberOfSisters', 'familyType', 'familyStatus', 'familyLocation'],
  preferences: ['preferredGender', 'minAge', 'maxAge', 'heightRange', 'religion', 'caste', 'motherTongue', 'maritalStatus', 'education', 'profession', 'incomeRange', 'location', 'nriPreference', 'manglikPreference'],
  lifestyle: [],
};

const LIFESTYLE_FIELDS = ['foodPreference', 'smoking', 'drinking', 'hobbies', 'interests', 'about'];

function asSection(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function computeProfileCompletion(data: ProfileData): number {
  let total = 0;
  let present = 0;

  const sections: Record<string, Record<string, unknown>> = {
    personal: asSection(data.personal),
    education: asSection(data.education),
    family: asSection(data.family),
    preferences: asSection(data.preferences),
  };

  for (const [section, fields] of Object.entries(COMPLETION_FIELDS)) {
    const sectObj = sections[section] || {};
    for (const field of fields) {
      total += 1;
      const v = sectObj[field];
      if (v !== undefined && v !== null && String(v).trim() !== '') present += 1;
    }
  }
  for (const field of LIFESTYLE_FIELDS) {
    total += 1;
    const v = sections.personal[field];
    if (v !== undefined && v !== null && String(v).trim() !== '') present += 1;
  }

  return total > 0 ? Math.round((present / total) * 100) : 0;
}

// Circular dynamic Profile Completion Score badge (scope §31)
function CompletionRing({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const stroke = clamped >= 70 ? '#0a7d4c' : clamped >= 40 ? '#d4a64a' : '#9b1f2f';

  return (
    <div
      className="relative h-[76px] w-[76px] shrink-0"
      role="img"
      aria-label={`Profile ${clamped}% complete`}
      title={`Profile ${clamped}% complete`}
    >
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#efe2d2" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-base font-black text-[#2c0d16]">{clamped}%</span>
        <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-[#6a4a57]">complete</span>
      </span>
    </div>
  );
}

// Guarded GET that never throws — network failures ("TypeError: Failed to
// fetch") resolve to null so one failed endpoint cannot blank the dashboard.

type ProfileResponse = { profile?: Partial<ProfileData> };
type StatsResponse = { stats?: { membership?: MembershipSummary; recommendedProfiles?: unknown[]; matchesRemaining?: number } };
type DocsResponse = { documents?: DocumentItem[] };
type AppointmentsResponse = { appointments?: Appointment[] };
type NotificationsResponse = { notifications?: NotificationItem[] };

// PRD funnel: Registration -> OTP -> Biodata -> Family -> Preferences ->
// Docs -> Submit -> Admin Review -> Membership. Rendered as a live tracker.
type OnboardingStep = { key: string; label: string; done: boolean };
type OnboardingStatus = {
  profileStatus: string;
  profileCompletion: number;
  steps: OnboardingStep[];
  nextStep: string;
  approved: boolean;
};

async function getJson<T>(path: string, headers: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, { headers });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function calculateAge(dob?: string) {
  if (!dob) return 0;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return 0;
  const diff = Date.now() - birth.getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

function isPendingDoc(doc: DocumentItem) {
  return String(doc.status || 'Pending').toLowerCase().includes('pending');
}

// Where each PRD funnel step is completed in the UI.
const STEP_HREF: Record<string, string> = {
  registration: '/register',
  otp: '/login',
  biodata: '/customer/biodata',
  family: '/customer/biodata',
  preferences: '/customer/biodata',
  documents: '/customer/documents',
  submit: '/customer/biodata',
  admin_review: '/customer',
  membership: '/customer/membership',
};

// Step-by-step onboarding tracker (PRD §3): Registration -> OTP -> Biodata ->
// Family Details -> Partner Preferences -> Upload Docs -> Submit -> Admin
// Review -> Membership. Each row deep-links to the screen that completes it.
function OnboardingChecklist({ status }: { status: OnboardingStatus }) {
  const doneCount = status.steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / status.steps.length) * 100);
  return (
    <section aria-label="Getting started" className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-black text-[#2c0d16]">Complete your journey</h2>
        <span className="rounded-full bg-[#f9f0d0] px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[#7b102d]">
          {doneCount}/{status.steps.length} done
        </span>
      </div>
      <div className="mb-5 h-2 w-full overflow-hidden rounded-full bg-[#efe2d2]">
        <div className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? 'bg-[#0a7d4c]' : 'bg-[#7b102d]'}`} style={{ width: `${pct}%` }} />
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {status.steps.map((step, index) => {
          const href = STEP_HREF[step.key] || '#';
          const active = !step.done && status.steps.slice(0, index).every((s) => s.done);
          return (
            <li key={step.key}>
              <Link
                href={href}
                className={`flex items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm transition ${
                  step.done
                    ? 'bg-[#eaf8ef] text-[#0a7d4c]'
                    : active
                      ? 'bg-[#fff7ee] font-bold text-[#7b102d] ring-1 ring-[#e0bd7a]'
                      : 'bg-[#fffaf3] text-[#6a4a57]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  {step.done ? <CircleCheckBig size={16} /> : <Circle size={16} className={active ? 'text-[#7b102d]' : 'text-[#c9b39a]'} />}
                  {step.label}
                </span>
                {!step.done && <ChevronRight size={14} className={active ? 'text-[#7b102d]' : 'text-[#c9b39a]'} />}
              </Link>
            </li>
          );
        })}
      </ol>
      {!status.approved && status.profileStatus !== 'Draft' && (
        <p className="mt-4 rounded-2xl bg-[#fff8ee] px-4 py-3 text-sm text-[#8a5a11]">
          Your profile is <strong>{status.profileStatus}</strong> — our team reviews every submission, usually within 24–48 hours.
        </p>
      )}
    </section>
  );
}

function formatExpiry(expiresAt?: number | null) {
  if (!expiresAt) return '—';
  return new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CustomerDashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData>(defaultProfile);
  const [membership, setMembership] = useState<MembershipSummary>({});
  const [recommendedCount, setRecommendedCount] = useState(0);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [topMatches, setTopMatches] = useState<MatchHighlight[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [bookingForm, setBookingForm] = useState({ date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), time: '09:00 AM', type: 'Consultation', notes: '' });
  const [bookingBusy, setBookingBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [supabaseProfile, setSupabaseProfile] = useState<Record<string, unknown> | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<{ id: string; email?: string } | null>(null);
  // Platform user id (users.id) — stored by the session bridge. Realtime
  // notifications are keyed on this, NOT the Supabase auth uid.
  const [platformUserId, setPlatformUserId] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoProgress, setPhotoProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Avatar display is driven by three sources, highest priority first:
  //   1. photoPreviewUrl — a local blob: URL shown the instant a file is
  //      picked, so the card updates before the network round trip finishes.
  //   2. avatarUrl       — the Supabase Storage URL returned by a successful
  //      upload. Set synchronously from the response, so no refresh is needed.
  //   3. storedAvatarUrl — whatever was already saved on the profile row.
  // The initial letter is rendered ONLY when all three are null/undefined.
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  const authHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : null;
  };

  /**
   * Swaps the local preview, revoking the previous blob: URL.
   *
   * The ref (not a useEffect with deps) is what makes this StrictMode-safe: in
   * dev React double-invokes effects, and a cleanup keyed on the URL would
   * revoke the very URL that is currently on screen.
   */
  const swapPreview = (url: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
    setPhotoPreviewUrl(url);
  };

  // Release the last preview when the dashboard unmounts.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  // The URL currently saved on the profile row, or null if there is none.
  const storedAvatarUrl = useMemo(() => {
    const p = supabaseProfile;
    if (!p) return null;
    const personal = p['personal'] as Record<string, unknown> | undefined;
    const candidate =
      (p['avatar_url'] as string) ||
      (p['photo_url'] as string) ||
      (p['profile_photo'] as string) ||
      (personal?.['photoUrl'] as string);
    return typeof candidate === 'string' && candidate.trim() ? candidate : null;
  }, [supabaseProfile]);

  // What the profile card actually renders. `avatarBroken` guards against a
  // saved URL that 404s or points at a host next/image refuses — the card then
  // degrades to the initial letter instead of a broken-image icon.
  const displayAvatarUrl = avatarBroken ? null : photoPreviewUrl || avatarUrl || storedAvatarUrl;

  /**
   * Edit Photo.
   *
   * Client-side compress → Supabase Storage (`avatars`) → public URL written
   * to profiles.avatar_url → React state updated in the same tick.
   *
   * A note on why this is Supabase Storage and not Cloudinary: profile photos
   * are written straight from the browser with the user's own JWT, so they
   * must not depend on Cloudinary credentials being present in the server env.
   * The `avatars` bucket needs its storage.objects RLS policies in place —
   * see supabase/storage_avatars.sql (applied via `npm run avatar:storage-setup`).
   */
  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset the input immediately so picking the same file twice in a row
    // still fires a change event.
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (!supabaseUser) {
      setStatusMessage('Please sign in before changing your profile photo.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setStatusMessage('Please choose an image file (JPG, PNG or WebP).');
      return;
    }

    setPhotoUploading(true);
    setPhotoProgress(0);
    setStatusMessage('');
    setAvatarBroken(false);

    // 1. Instant preview from the picked file — paints before any network work.
    swapPreview(URL.createObjectURL(file));

    let compressedUrl: string | null = null;
    try {
      // 2. Compress any input (10 MB, 50 MB, …) down to a few KB.
      const compressed = await compressAvatar(file, {
        onProgress: setPhotoProgress,
      });
      compressedUrl = compressed.objectUrl;

      const supabase = getSupabase();
      if (!supabase) throw new Error('Storage is not configured — please try again later.');

      // 3. Upload to the `avatars` bucket under this user's own folder. The
      //    folder prefix is what the storage RLS policy checks, so it must be
      //    exactly auth.uid(). A fresh filename each time means no CDN staleness.
      const filePath = `${supabaseUser.id}/avatar-${Date.now()}.${compressed.extension}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, compressed.blob, {
          upsert: true,
          contentType: compressed.mimeType,
          cacheControl: '31536000',
        });

      if (uploadError) {
        // Surface the real cause. The historical failure here was a 403
        // "new row violates row-level security policy" from missing policies.
        throw new Error(uploadError.message || 'Upload was rejected by storage.');
      }

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const photoUrl = publicUrlData?.publicUrl;
      if (!photoUrl) throw new Error('Storage did not return a public URL.');

      // 4. Persist to profiles.avatar_url (plus the legacy mirrored columns).
      const updatePayload = {
        avatar_url: photoUrl,
        photo_url: photoUrl,
        profile_photo: photoUrl,
        updated_at: new Date().toISOString(),
      };

      // Try the fast path (row already exists), then fall back to an upsert for
      // users whose row was never bootstrapped.
      const { error: updateError } = await supabase
        .from('profiles')
        .update(updatePayload as never)
        .eq('id', supabaseUser.id);

      if (updateError) {
        const { error: upsertError } = await supabase
          .from('profiles')
          .upsert({ id: supabaseUser.id, user_id: supabaseUser.id, ...updatePayload } as never, {
            onConflict: 'id',
          } as never);
        if (upsertError) {
          console.warn('[customer] profile update failed:', upsertError.message);
          // Not fatal: the file is stored and the photo is shown. Only the
          // saved reference is missing, so tell the user honestly.
          setStatusMessage(
            'Photo uploaded, but saving it to your profile failed. It may not survive a reload.'
          );
        }
      }

      // 5. Point the preview at the compressed result and commit it as the
      //    avatar straight away — no page refresh required.
      swapPreview(compressedUrl);
      compressedUrl = null; // ownership transferred to swapPreview; do not revoke
      setAvatarUrl(photoUrl);

      // Keep the profile row in sync so other sections read the new photo.
      setSupabaseProfile((prev) => {
        const base = prev ?? ({} as Record<string, unknown>);
        const personal = (base['personal'] as Record<string, unknown>) ?? {};
        return {
          ...base,
          avatar_url: photoUrl,
          photo_url: photoUrl,
          profile_photo: photoUrl,
          personal: { ...personal, photoUrl },
        } as Record<string, unknown>;
      });

      try {
        const cached = JSON.parse(localStorage.getItem('shubhSanjogProfile') || '{}');
        localStorage.setItem(
          'shubhSanjogProfile',
          JSON.stringify({ ...cached, avatar_url: photoUrl, photo_url: photoUrl, profile_photo: photoUrl })
        );
      } catch {
        /* localStorage unavailable (private mode) — non-fatal */
      }

      // Tell the server's audit log about the photo change so the admin live
      // activity feed reflects it (the Supabase upload itself does not hit the
      // Express API; without this self-report the admin's "Activity" tab
      // would never show photo updates).
      try {
        await fetch(`${API}/customer/activity-log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(authHeaders() || {}) },
          body: JSON.stringify({
            action: 'PROFILE_PHOTO_CHANGE',
            detail: `compressed ${formatBytes(compressed.originalSize)} → ${formatBytes(compressed.compressedSize)}`,
          }),
        });
      } catch {
        /* activity log is best-effort */
      }

      setStatusMessage(
        `Profile photo updated — ${formatBytes(compressed.originalSize)} compressed to ${formatBytes(
          compressed.compressedSize
        )}.`
      );
      router.refresh();
    } catch (err) {
      console.error('[customer] Photo upload failed:', err);
      const message = err instanceof Error ? err.message : '';
      setStatusMessage(
        /row-level security/i.test(message)
          ? 'Upload blocked by storage permissions. Run `npm run avatar:storage-setup` to apply the avatar policies.'
          : message || 'Photo upload failed. Please try again.'
      );
      // Roll the preview back to whatever was there before.
      swapPreview(null);
    } finally {
      // Only revoke if ownership was not handed to swapPreview.
      if (compressedUrl) URL.revokeObjectURL(compressedUrl);
      setPhotoUploading(false);
      setPhotoProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const loadData = async () => {
    const headers = authHeaders();
    if (!headers) {
      setStatusMessage('Please log in to view your dashboard.');
      setLoading(false);
      return;
    }

    // Every request is independent: one failed endpoint can never blank out
    // the whole dashboard. All data comes live from MongoDB via the API.
    const [profileJson, statsJson, docsJson, appointmentsJson, notificationsJson, matchesJson, onboardingJson] = await Promise.all([
      getJson<ProfileResponse>('/customer/profile', headers),
      getJson<StatsResponse>('/dashboard/stats', headers),
      getJson<DocsResponse>('/documents', headers),
      getJson<AppointmentsResponse>('/appointments/my', headers),
      getJson<NotificationsResponse>('/notifications', headers),
      // PRD high-priority #1 — compatibility-scored candidates for the highlights card
      getJson<{ profiles?: MatchHighlight[] }>('/matches/search', headers),
      getJson<{ onboarding?: OnboardingStatus }>('/customer/onboarding-status', headers),
    ]);

    if (!profileJson && !statsJson && !docsJson) {
      setLoadError('Could not reach the server — your data could not be loaded. Please refresh in a moment.');
    } else {
      setLoadError('');
    }

    if (profileJson?.profile) {
      setProfile({
        ...defaultProfile,
        ...(profileJson.profile as ProfileData),
      });
    }
    const stats = statsJson?.stats;
    if (stats) {
      if (stats.membership) setMembership(stats.membership);
      setRecommendedCount(Array.isArray(stats.recommendedProfiles) ? stats.recommendedProfiles.length : Number(stats.matchesRemaining) || 0);
    }
    setDocuments(docsJson?.documents || []);
    setAppointments(appointmentsJson?.appointments || []);
    setNotifications(notificationsJson?.notifications || []);
    setOnboarding(onboardingJson?.onboarding || null);
    // Top 3 by compatibility score (PRD high-priority #1)
    const scored = [...(matchesJson?.profiles || [])].sort((a, b) => Number(b.matchScore || 0) - Number(a.matchScore || 0));
    setTopMatches(scored.slice(0, 3));

    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // 🔔 Realtime notifications are keyed on the PLATFORM user id (users.id),
    // which the session bridge stores in localStorage — not the Supabase uid.
    try {
      const cachedUser = JSON.parse(localStorage.getItem('shubhSanjogUser') || 'null');
      if (cachedUser?.id) setPlatformUserId(String(cachedUser.id));
    } catch {
      /* corrupted cache — realtime still works, RLS does the real scoping */
    }
    // Fetch Supabase-authenticated user & profile (for OAuth + new `profiles` table)
    (async () => {
      try {
        const supabase = getSupabase();
        if (!supabase) return;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        setSupabaseUser({ id: user.id, email: user.email || undefined });

        // Try `profiles` table first
        let fetched: Record<string, unknown> | null = null;
        try {
          const { data } = await supabase.from('profiles').select(PROFILE_DISPLAY_COLUMNS).eq('id', user.id).maybeSingle();
          if (data) fetched = data as unknown as Record<string, unknown>;
        } catch {}
        if (!fetched) {
          try {
            const { data } = await supabase.from('profiles').select(PROFILE_DISPLAY_COLUMNS).eq('user_id', user.id).maybeSingle();
            if (data) fetched = data as unknown as Record<string, unknown>;
          } catch {}
        }
        if (!fetched) {
          try {
            const { data } = await supabase.from('matrimonial_profiles').select('personal, education, family, status').eq('user_id', user.id).maybeSingle();
            if (data) {
              // Normalize matrimonial_profiles shape into flat profile for display
              const mp = data as { personal?: Record<string, unknown>; education?: Record<string, unknown>; family?: Record<string, unknown>; status?: string };
              fetched = {
                full_name: `${(mp.personal as { firstName?: string })?.firstName || ''} ${(mp.personal as { lastName?: string })?.lastName || ''}`.trim(),
                age: (mp.personal as { age?: unknown })?.age,
                gender: (mp.personal as { gender?: unknown })?.gender,
                religion: (mp.personal as { religion?: unknown })?.religion,
                city: (mp.personal as { city?: unknown })?.city,
                profession: (mp.education as { profession?: unknown })?.profession,
                education: (mp.education as { highestQualification?: unknown })?.highestQualification,
                bio: (mp.personal as { about?: unknown })?.about || (mp.personal as { bio?: unknown })?.bio,
                status: mp.status,
                raw: data,
              };
            }
          } catch {}
        }
        if (fetched) {
          setSupabaseProfile(fetched);
          // Merge into existing profile state for compatibility with current dashboard UI
          try {
            const personalPatch: Record<string, unknown> = {};
            const eduPatch: Record<string, unknown> = {};
            if (fetched['full_name']) {
              const parts = String(fetched['full_name']).trim().split(' ');
              personalPatch['firstName'] = parts[0] || '';
              personalPatch['lastName'] = parts.slice(1).join(' ') || '';
            }
            if (fetched['gender']) personalPatch['gender'] = fetched['gender'];
            if (fetched['religion']) personalPatch['religion'] = fetched['religion'];
            if (fetched['caste']) personalPatch['caste'] = fetched['caste'];
            if (fetched['city']) personalPatch['city'] = fetched['city'];
            if (fetched['age']) personalPatch['age'] = fetched['age'];
            if (fetched['bio']) (personalPatch['about'] as unknown) = fetched['bio'];
            if (fetched['profession']) eduPatch['profession'] = fetched['profession'];
            if (fetched['education']) eduPatch['highestQualification'] = fetched['education'];
            if (Object.keys(personalPatch).length || Object.keys(eduPatch).length) {
              setProfile((prev) => ({
                ...prev,
                personal: { ...prev.personal, ...(personalPatch as PersonalInfo) },
                education: { ...prev.education, ...(eduPatch as ProfileData['education']) },
              }));
            }
          } catch {}
        } else {
          // Fallback to localStorage when Supabase tables are missing (PGRST205) or profile not found
          try {
            const raw = localStorage.getItem('shubhSanjogProfile');
            if (raw) {
              const local = JSON.parse(raw) as Record<string, unknown>;
              setSupabaseProfile(local);
              const personal = (local['personal'] as Record<string, unknown>) || {};
              const edu = (local['education'] as Record<string, unknown>) || {};
              const family = (local['family'] as Record<string, unknown>) || {};
              setProfile((prev) => ({
                ...prev,
                personal: {
                  ...prev.personal,
                  firstName: (personal['firstName'] as string) || (local['full_name'] as string)?.split(' ')[0] || prev.personal?.firstName,
                  lastName: (personal['lastName'] as string) || (local['full_name'] as string)?.split(' ').slice(1).join(' ') || prev.personal?.lastName,
                  gender: (personal['gender'] as string) || (local['gender'] as string) || prev.personal?.gender,
                  dob: (personal['dob'] as string) || (local['dob'] as string) || prev.personal?.dob,
                  religion: (personal['religion'] as string) || (local['religion'] as string) || prev.personal?.religion,
                  caste: (personal['caste'] as string) || (local['caste'] as string) || prev.personal?.caste,
                  motherTongue: (personal['motherTongue'] as string) || (local['mother_tongue'] as string) || prev.personal?.motherTongue,
                  city: (personal['city'] as string) || (local['city'] as string) || prev.personal?.city,
                },
                education: {
                  ...prev.education,
                  highestQualification: (edu['highestQualification'] as string) || (local['highest_qualification'] as string) || prev.education?.highestQualification,
                  profession: (edu['profession'] as string) || (local['profession'] as string) || prev.education?.profession,
                  annualIncome: (edu['annualIncome'] as string) || (local['annual_income'] as string) || prev.education?.annualIncome,
                },
                family: {
                  ...prev.family,
                  fatherName: (family['fatherName'] as string) || (local['father_name'] as string) || prev.family?.fatherName,
                  motherName: (family['motherName'] as string) || (local['mother_name'] as string) || prev.family?.motherName,
                },
              }));
            }
          } catch {}
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fullName = useMemo(() => {
    const personal = profile.personal || {};
    return `${personal.firstName || ''} ${personal.lastName || ''}`.trim() || 'Customer';
  }, [profile]);

  // Dynamic Profile Completion Score: prefer the server-computed value but fall
  // back to the client-side calculation so the badge always reflects the
  // current biodata, even if the API is unreachable or stale.
  const profileCompletion = useMemo(
    () => Math.max(Number(profile.profileCompletion ?? 0), computeProfileCompletion(profile)),
    [profile]
  );

  const pendingDocs = useMemo(() => documents.filter(isPendingDoc), [documents]);
  const approvedDocs = useMemo(() => documents.filter((doc) => String(doc.status || '').toLowerCase().includes('approved')), [documents]);

  const upcomingAppointment = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return appointments.find((item) => item.status !== 'Cancelled' && item.date >= today) || null;
  }, [appointments]);

  // Dashboard cards from the reference scope document (§16)
  const summaryCards = [
    { label: 'Profile Completion', value: `${profileCompletion}%` },
    { label: 'Current Membership', value: membership.active === false ? 'Inactive' : membership.tier || 'Free' },
    { label: 'Membership Expiry', value: formatExpiry(membership.expiresAt) },
    { label: 'Meetings Remaining', value: `${membership.meetingsLeft ?? 0}/${membership.meetingsAllowed ?? 0}` },
    { label: 'Profiles Remaining', value: `${membership.profilesRemaining ?? 0}/${membership.profilesAllowed ?? 0}` },
    { label: 'Upcoming Appointment', value: upcomingAppointment ? `${upcomingAppointment.date}`.slice(5) + ' • ' + upcomingAppointment.time : 'None booked' },
    { label: 'Recommended Matches', value: String(recommendedCount) },
    { label: 'Pending Documents', value: String(pendingDocs.length) },
    { label: 'Notifications', value: String(notifications.length) },
  ];

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const headers = authHeaders();
    if (!headers) {
      setStatusMessage('Please log in to upload your horoscope.');
      return;
    }

    setUploadBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', 'kundli');
      const { ok, json, networkError } = await requestJson('/documents/upload', {
        method: 'POST',
        headers,
        body: formData,
      });
      if (networkError) throw new Error('You appear to be offline — the API server is unreachable. Please retry the upload once you are back online.');
      const detail = (json ?? {}) as { error?: string };
      if (!ok) throw new Error(detail.error || 'Upload failed');
      setStatusMessage('Horoscope uploaded and marked for review.');
      await loadData();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploadBusy(false);
      event.target.value = '';
    }
  };

  const handleBooking = async (event: React.FormEvent) => {
    event.preventDefault();
    const headers = authHeaders();
    if (!headers) {
      setStatusMessage('Please log in to schedule a consultation.');
      return;
    }

    setBookingBusy(true);
    try {
      const { ok, json, networkError } = await requestJson('/appointments/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ date: bookingForm.date, time: bookingForm.time, type: bookingForm.type, notes: bookingForm.notes }),
      });
      if (networkError) throw new Error('You appear to be offline — the booking could not be saved. Please retry once the API server is reachable.');
      const detail = (json ?? {}) as { error?: string };
      if (!ok) throw new Error(detail.error || 'Booking failed');
      setStatusMessage('Consultation booked successfully.');
      setBookingForm({ date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), time: '09:00 AM', type: 'Consultation', notes: '' });
      await loadData();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Booking failed');
    } finally {
      setBookingBusy(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#fffaf8] px-4 py-12 text-[#2c0d16]">Loading customer dashboard...</div>;
  }

  const quickActions = [
    { label: 'Complete Profile', href: '/customer/biodata' },
    { label: 'Update Preferences', href: '/customer/biodata' },
    { label: 'View Matches', href: '/customer/recommended' },
    { label: 'Book Consultation', href: '/customer/appointments' },
    { label: 'Upgrade Membership', href: '/customer/membership' },
    { label: 'Upload Documents', href: '/customer/documents' },
  ];

  return (
    <div className="min-h-screen bg-[#fffaf8] px-4 py-6 text-[#2c0d16] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <MembershipExpiryBanner />
        <div className="mb-6 flex flex-col gap-4 rounded-[28px] border border-[#f1d7a6] bg-white p-5 shadow-soft lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3.5">
            <Image
              src="/logo.png"
              alt="Shubh Sanjog Matrimony"
              width={48}
              height={48}
              className="hidden h-12 w-12 shrink-0 rounded-full object-contain shadow-sm ring-1 ring-[#e5c88d] sm:block"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#7b102d]">Customer panel</p>
              <h1 className="mt-2 flex flex-wrap items-center gap-3 text-3xl font-black tracking-[-0.04em] text-[#2c0d16]">
                Welcome, {fullName}
              {/* §30/§31: Verified Profile badge for admin-approved profiles */}
              {profile.status === 'Approved' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#eaf8ef] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#0a7d4c]">
                  <ShieldCheck size={13} /> Verified Profile
                </span>
              ) : null}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* §31: dynamic Profile Completion Score badge */}
            <CompletionRing value={profileCompletion} />
            <Link href="/customer/biodata" className="rounded-full border border-[#e5c88d] bg-[#fffaf0] px-4 py-2 text-sm font-semibold text-[#7b102d]">Edit profile</Link>
            <Link href="/" className="rounded-full bg-[#7b102d] px-4 py-2 text-sm font-semibold text-white">Back to home</Link>
          </div>
        </div>

        {statusMessage && <div className="mb-5 rounded-2xl border border-[#f2d9a8] bg-[#fffaf3] p-3 text-sm text-[#5a3743]">{statusMessage}</div>}
        {loadError && <div className="mb-5 rounded-2xl border border-[#f3cccc] bg-[#fdf1f1] p-3 text-sm font-medium text-[#9b1f2f]">{loadError}</div>}

        {/* PRD §3 step-by-step onboarding tracker */}
        {onboarding && <OnboardingChecklist status={onboarding} />}

        {/* Structured Matrimonial Profile Display — all categories with edit options */}
        {supabaseProfile && (
          <section className="mb-6 overflow-hidden rounded-[28px] border border-[#f2d9a8] bg-white shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-[#7b102d] to-[#a91336] px-5 py-4 sm:px-6">
              <h2 className="flex items-center gap-2 text-lg font-black text-white"><Sparkles size={18} className="text-[#f2d9a8]" /> Your Matrimony Profile</h2>
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${membership.active === false ? 'bg-[#ffe5e5] text-[#9b1f2f]' : 'bg-[#eaf8ef] text-[#0a7d4c]'}`}>
                {membership.active === false ? 'Inactive' : membership.tier || 'Free'} • {profile.status || (supabaseProfile['status'] as string) || 'Active'}
              </span>
            </div>

            <div className="p-5 sm:p-6">
              <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
                {/* Profile Picture */}
                <div className="flex flex-col items-center gap-3 rounded-2xl bg-[#fffaf3] p-5">
                  {(() => {
                    // Priority order: live preview → freshly uploaded URL → the
                    // URL saved on the profile row. The initial letter is a
                    // genuine last resort, used only when all three are empty.
                    const isPreview = displayAvatarUrl?.startsWith('blob:');
                    const spinner = photoUploading ? (
                      <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-black/45">
                        <span className="text-xs font-bold text-white">
                          {photoProgress > 0 && photoProgress < 100 ? `${photoProgress}%` : 'Uploading…'}
                        </span>
                      </div>
                    ) : null;

                    if (!displayAvatarUrl) {
                      return (
                        <div className="relative flex h-40 w-40 items-center justify-center rounded-3xl bg-gradient-to-br from-[#7b102d] to-[#d4a64a] text-5xl font-black text-white shadow-md">
                          {(String(supabaseProfile['full_name'] || fullName).trim().charAt(0) || 'C').toUpperCase()}
                          {spinner}
                        </div>
                      );
                    }

                    return (
                      <div className="relative h-40 w-40">
                        <Image
                          // Remount on URL change so the browser refetches when
                          // the local preview is replaced by the stored avatar.
                          key={displayAvatarUrl}
                          src={displayAvatarUrl}
                          alt={String(supabaseProfile['full_name'] || fullName)}
                          width={160}
                          height={160}
                          sizes="160px"
                          quality={75}
                          // blob: URLs are already local and already tiny —
                          // routing them through the image optimizer would only
                          // add a round trip.
                          unoptimized={isPreview}
                          className="h-40 w-40 rounded-3xl object-cover shadow-md ring-2 ring-[#f2d9a8]"
                          // A saved URL that 404s (or points at a host that is
                          // not allowlisted) degrades to the initial letter
                          // rather than a broken-image icon.
                          onError={() => setAvatarBroken(true)}
                        />
                        {spinner}
                      </div>
                    );
                  })()}
                  <div className="text-center">
                    <div className="text-lg font-black text-[#2c0d16]">{String(supabaseProfile['full_name'] || supabaseProfile['fullName'] || fullName)}</div>
                    <div className="text-xs text-[#6a4a57]">{supabaseUser?.email || (supabaseProfile['email'] as string) || profile.personal?.email || ''}</div>
                    <div className="mt-1 text-sm font-semibold text-[#7b102d]">
                      {[supabaseProfile['age'] ? `${supabaseProfile['age']} yrs` : profile.personal?.dob ? `${calculateAge(profile.personal.dob)} yrs` : null, supabaseProfile['gender'] || profile.personal?.gender].filter(Boolean).join(' • ') || '—'}
                    </div>
                    {/* No size limit needed — the file is compressed to a few KB
                        in the browser before it is uploaded. */}
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={photoUploading}
                      className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#7b102d] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#5a0a1f] disabled:opacity-60"
                    >
                      {photoUploading
                        ? photoProgress > 0 && photoProgress < 100
                          ? `Compressing ${photoProgress}%`
                          : 'Uploading…'
                        : 'Edit Photo'}
                    </button>
                    <Link href="/register/fill-details?step=1" className="mt-1 text-[11px] text-[#6a4a57] underline hover:text-[#7b102d]">Edit details</Link>
                    {/* Verified-document badges: ID, Income, Kundli, etc. Each
                        reflects the user's actual review status — Approved
                        (green), Pending (amber), Rejected (rose). */}
                    <div className="mt-3 flex justify-center">
                      <DocumentBadges documents={documents as DocumentLike[]} dense />
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  {/* Personal Information */}
                  <div className="rounded-2xl border border-[#f2d9a8] bg-[#fffaf3] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-[#7b102d]"><User size={14} /> Personal Information</h3>
                      <Link href="/register/fill-details?step=1" className="text-xs font-bold text-[#7b102d] underline">Edit</Link>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        { label: 'Full Name', value: supabaseProfile['full_name'] || supabaseProfile['fullName'] || fullName },
                        { label: 'Gender', value: supabaseProfile['gender'] || profile.personal?.gender || '—' },
                        { label: 'Date of Birth', value: supabaseProfile['dob'] || supabaseProfile['date_of_birth'] || profile.personal?.dob || '—' },
                        { label: 'Age', value: supabaseProfile['age'] ? `${supabaseProfile['age']} years` : profile.personal?.dob ? `${calculateAge(profile.personal.dob)} years` : '—' },
                        { label: 'Height', value: supabaseProfile['height'] || (supabaseProfile['personal'] as Record<string,unknown>)?.['height'] || '—' },
                        { label: 'Weight', value: supabaseProfile['weight'] || (supabaseProfile['personal'] as Record<string,unknown>)?.['weight'] || '—' },
                        { label: 'Religion', value: supabaseProfile['religion'] || profile.personal?.religion || '—' },
                        { label: 'Caste', value: supabaseProfile['caste'] || profile.personal?.caste || '—' },
                        { label: 'Sub-Caste', value: supabaseProfile['sub_caste'] || supabaseProfile['subCaste'] || profile.personal?.subCaste || '—' },
                        { label: 'Mother Tongue', value: supabaseProfile['mother_tongue'] || supabaseProfile['motherTongue'] || profile.personal?.motherTongue || '—' },
                        { label: 'Marital Status', value: supabaseProfile['marital_status'] || supabaseProfile['maritalStatus'] || profile.personal?.maritalStatus || '—' },
                        { label: 'Location', value: supabaseProfile['location'] || supabaseProfile['city'] || profile.personal?.city || '—' },
                        { label: 'Country', value: supabaseProfile['country'] || '—' },
                        { label: 'Citizenship', value: supabaseProfile['citizenship'] || '—' },
                        { label: 'NRI Status', value: supabaseProfile['nri_status'] === true || supabaseProfile['nri_status'] === 'Yes' ? 'Yes' : supabaseProfile['nri_status'] === false || supabaseProfile['nri_status'] === 'No' ? 'No' : (supabaseProfile['nriStatus'] ? 'Yes' : 'No') },
                        { label: 'Manglik Status', value: supabaseProfile['manglik_status'] || supabaseProfile['manglikStatus'] || '—' },
                        { label: 'Horoscope', value: supabaseProfile['horoscope_details'] || supabaseProfile['horoscopeDetails'] || '—' },
                        { label: 'Phone', value: supabaseProfile['phone'] || supabaseProfile['phone_number'] || profile.personal?.mobile || '—' },
                      ].map((item) => (
                        <div key={item.label} className="rounded-xl bg-white px-3 py-2.5 shadow-sm">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a6a75]">{item.label}</div>
                          <div className="mt-0.5 truncate text-sm font-bold text-[#2c0d16]" title={String(item.value)}>{String(item.value)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Education & Career */}
                  <div className="rounded-2xl border border-[#f2d9a8] bg-[#fffaf3] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-[#7b102d]"><GraduationCap size={14} /> Education & Career</h3>
                      <Link href="/register/fill-details?step=2" className="text-xs font-bold text-[#7b102d] underline">Edit</Link>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        { label: 'Highest Qualification', value: supabaseProfile['highest_qualification'] || supabaseProfile['qualification'] || supabaseProfile['highestQualification'] || profile.education?.highestQualification || '—' },
                        { label: 'Education Details', value: supabaseProfile['education_details'] || supabaseProfile['educationDetails'] || '—' },
                        { label: 'Profession', value: supabaseProfile['profession'] || profile.education?.profession || '—' },
                        { label: 'Job / Business', value: supabaseProfile['job_business'] || supabaseProfile['jobBusiness'] || '—' },
                        { label: 'Company', value: supabaseProfile['company'] || supabaseProfile['organization'] || profile.education?.company || '—' },
                        { label: 'Annual Income', value: supabaseProfile['annual_income'] || supabaseProfile['annualIncome'] || profile.education?.annualIncome || '—' },
                        { label: 'Work Location', value: supabaseProfile['work_location'] || supabaseProfile['workLocation'] || profile.education?.workLocation || '—' },
                        { label: 'Experience', value: supabaseProfile['experience'] || supabaseProfile['years_of_experience'] || '—' },
                      ].map((item) => (
                        <div key={item.label} className="rounded-xl bg-white px-3 py-2.5 shadow-sm">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a6a75]">{item.label}</div>
                          <div className="mt-0.5 truncate text-sm font-bold text-[#2c0d16]" title={String(item.value)}>{String(item.value)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Lifestyle & About Me */}
                  <div className="rounded-2xl border border-[#f2d9a8] bg-[#fffaf3] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-[#7b102d]"><Heart size={14} /> Lifestyle & About Me</h3>
                      <Link href="/register/fill-details?step=3" className="text-xs font-bold text-[#7b102d] underline">Edit</Link>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        { label: 'Food Preference', value: supabaseProfile['food_preference'] || supabaseProfile['foodPreference'] || '—' },
                        { label: 'Smoking', value: supabaseProfile['smoking'] || '—' },
                        { label: 'Drinking', value: supabaseProfile['drinking'] || '—' },
                        { label: 'Hobbies', value: supabaseProfile['hobbies'] || '—' },
                        { label: 'Interests', value: supabaseProfile['interests'] || '—' },
                      ].map((item) => (
                        <div key={item.label} className="rounded-xl bg-white px-3 py-2.5 shadow-sm">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a6a75]">{item.label}</div>
                          <div className="mt-0.5 truncate text-sm font-bold text-[#2c0d16]" title={String(item.value)}>{String(item.value)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 rounded-xl bg-white p-3 shadow-sm">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a6a75]">About Me</div>
                      <div className="mt-1 text-sm leading-6 text-[#2c0d16]">{String(supabaseProfile['about'] || supabaseProfile['about_me'] || supabaseProfile['bio'] || supabaseProfile['personality'] || '—')}</div>
                    </div>
                  </div>

                  {/* Family Information */}
                  <div className="rounded-2xl border border-[#f2d9a8] bg-[#fffaf3] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-[#7b102d]"><Users size={14} /> Family Information</h3>
                      <Link href="/register/fill-details?step=4" className="text-xs font-bold text-[#7b102d] underline">Edit</Link>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        { label: "Father's Name", value: supabaseProfile['father_name'] || supabaseProfile['fatherName'] || profile.family?.fatherName || '—' },
                        { label: "Father's Occupation", value: supabaseProfile['father_occupation'] || supabaseProfile['fatherOccupation'] || profile.family?.fatherOccupation || '—' },
                        { label: "Mother's Name", value: supabaseProfile['mother_name'] || supabaseProfile['motherName'] || profile.family?.motherName || '—' },
                        { label: "Mother's Occupation", value: supabaseProfile['mother_occupation'] || supabaseProfile['motherOccupation'] || profile.family?.motherOccupation || '—' },
                        { label: 'Brothers', value: supabaseProfile['brothers'] ?? supabaseProfile['number_of_brothers'] ?? profile.family?.numberOfBrothers ?? '—' },
                        { label: 'Sisters', value: supabaseProfile['sisters'] ?? supabaseProfile['number_of_sisters'] ?? profile.family?.numberOfSisters ?? '—' },
                        { label: 'Family Type', value: supabaseProfile['family_type'] || supabaseProfile['familyType'] || profile.family?.familyType || '—' },
                        { label: 'Family Status', value: supabaseProfile['family_status'] || supabaseProfile['familyStatus'] || profile.family?.familyStatus || '—' },
                        { label: 'Family Location', value: supabaseProfile['family_location'] || supabaseProfile['familyLocation'] || profile.family?.familyLocation || '—' },
                      ].map((item) => (
                        <div key={item.label} className="rounded-xl bg-white px-3 py-2.5 shadow-sm">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a6a75]">{item.label}</div>
                          <div className="mt-0.5 truncate text-sm font-bold text-[#2c0d16]" title={String(item.value)}>{String(item.value)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Membership Status */}
                  <div className="rounded-2xl bg-gradient-to-r from-[#fff7ee] to-[#fffaf3] p-4 ring-1 ring-[#f2d9a8]">
                    <h3 className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-[#7b102d]">Membership Status</h3>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl bg-white px-3 py-2.5 shadow-sm">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a6a75]">Plan</div>
                        <div className="mt-0.5 text-sm font-bold text-[#2c0d16]">{membership.tier || 'Free'}</div>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2.5 shadow-sm">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a6a75]">Status</div>
                        <div className={`mt-0.5 text-sm font-bold ${membership.active === false ? 'text-[#9b1f2f]' : 'text-[#0a7d4c]'}`}>{membership.active === false ? 'Inactive' : 'Active'}</div>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2.5 shadow-sm">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a6a75]">Expiry</div>
                        <div className="mt-0.5 text-sm font-bold text-[#2c0d16]">{formatExpiry(membership.expiresAt)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="rounded-[28px] border border-[#f2d9a8] bg-white p-4 shadow-soft">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#7b102d] to-[#d4a64a] text-lg font-black text-white">{fullName.charAt(0).toUpperCase() || 'C'}</div>
              <div>
                <div className="text-lg font-black">{fullName}</div>
                <div className="text-xs text-[#6a4a57]">{membership.tier || 'Free'} Member</div>
              </div>
            </div>

            <nav className="space-y-2">
              {navItems.map(({ label, icon: Icon, href }) => (
                <Link key={label} href={href} className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-[#4d2c36] transition hover:bg-[#fff7ee] hover:text-[#7b102d]">
                  <span className="flex items-center gap-3"><Icon size={16} /> {label}</span>
                  <ChevronRight size={14} />
                </Link>
              ))}
            </nav>
          </aside>

          <main className="space-y-6">
            {/* Overview cards — scope §16 */}
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {summaryCards.map((card) => (
                <div key={card.label} className="rounded-[24px] border border-[#f2d8a8] bg-white p-5 shadow-soft">
                  <div className="text-sm text-[#5a3743]">{card.label}</div>
                  <div className="mt-3 truncate text-2xl font-black text-[#2c0d16]" title={String(card.value)}>{card.value}</div>
                </div>
              ))}
            </section>

            {/* Compatibility highlights — PRD high-priority #1: automated
                match score vs this member's saved partner preferences. */}
            <section aria-label="Compatibility highlights" className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-black text-[#2c0d16]">Compatibility highlights</h2>
                <Link href="/customer/recommended" className="text-sm font-semibold text-[#7b102d] underline underline-offset-2">View all matches</Link>
              </div>
              <p className="-mt-2 mb-4 text-sm text-[#5a3743]">Scored against your partner preferences — age, religion &amp; caste, education &amp; career, location and manglik status.</p>
              {topMatches.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#f2d9a8] bg-[#fffaf3] p-4 text-sm text-[#5a3743]">
                  No scored matches yet — submit your biodata and preferences to unlock compatibility scoring.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  {topMatches.map((match) => {
                    const score = Math.max(0, Math.min(100, Number(match.matchScore || 0)));
                    return (
                      <Link key={match.id} href="/customer/recommended" className="group rounded-2xl border border-[#f2d8a8] bg-[#fffaf3] p-4 transition hover:border-[#e0bd7a]">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-bold text-[#2c0d16]" title={match.name}>{match.name}</div>
                            <div className="mt-0.5 truncate text-xs text-[#6a4a57]">
                              {[match.age ? `${match.age} yrs` : '', match.city || '', match.profession || ''].filter(Boolean).join(' • ') || '—'}
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${compatibilityBadgeClass(score)}`} title={match.matchReasons || undefined}>
                            {score}% Match
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-xl font-black text-[#2c0d16]">Profile overview</h2>
                  <span className="rounded-full bg-[#f9f0d0] px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[#7b102d]">{profileCompletion >= 70 ? 'Active' : 'In progress'}</span>
                </div>
                {/* §31: Profile Completion Score */}
                <div className="mb-5 rounded-2xl bg-[#fff8ee] p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold uppercase tracking-[0.16em] text-[#7b102d]">Profile completion score</span>
                    <span className={`text-lg font-black ${profileCompletion >= 70 ? 'text-[#0a7d4c]' : 'text-[#8a5a11]'}`}>{profileCompletion}%</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#efe2d2]">
                    <div
                      className={`h-full rounded-full ${profileCompletion >= 70 ? 'bg-[#0a7d4c]' : profileCompletion >= 40 ? 'bg-[#d4a64a]' : 'bg-[#9b1f2f]'}`}
                      style={{ width: `${Math.max(0, Math.min(100, profileCompletion))}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-[#6a4a57]">{profile.status === 'Approved' ? 'Your profile is verified by our team.' : 'Complete your biodata and submit it for review to earn the Verified badge.'}</div>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="rounded-2xl bg-[#fff8ee] p-4"><div className="text-xs uppercase tracking-[0.2em] text-[#7b102d]">Age</div><div className="mt-3 text-2xl font-black">{calculateAge(profile.personal?.dob) || '—'}</div></div>
                  <div className="rounded-2xl bg-[#fff8ee] p-4"><div className="text-xs uppercase tracking-[0.2em] text-[#7b102d]">Religion</div><div className="mt-3 text-2xl font-black">{profile.personal?.religion || '—'}</div></div>
                  <div className="rounded-2xl bg-[#fff8ee] p-4"><div className="text-xs uppercase tracking-[0.2em] text-[#7b102d]">Profession</div><div className="mt-3 truncate text-2xl font-black">{profile.education?.profession || '—'}</div></div>
                  <div className="rounded-2xl bg-[#fff8ee] p-4"><div className="text-xs uppercase tracking-[0.2em] text-[#7b102d]">City</div><div className="mt-3 text-2xl font-black">{profile.personal?.city || '—'}</div></div>
                </div>

                {/* Family structure (scope PDF §6) — parents' occupations, siblings, family status */}
                <div className="mt-5 rounded-2xl bg-[#fff8ee] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#7b102d]">Family details</span>
                    <Link href="/customer/biodata" className="text-xs font-bold text-[#7b102d] underline underline-offset-2">Edit family details</Link>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      { label: "Father's name", value: profile.family?.fatherName },
                      { label: "Father's occupation", value: profile.family?.fatherOccupation },
                      { label: "Mother's name", value: profile.family?.motherName },
                      { label: "Mother's occupation", value: profile.family?.motherOccupation },
                      {
                        label: 'Siblings',
                        value:
                          profile.family?.numberOfBrothers !== undefined || profile.family?.numberOfSisters !== undefined
                            ? `${Number(profile.family?.numberOfBrothers) || 0} brother${Number(profile.family?.numberOfBrothers) === 1 ? '' : 's'} • ${Number(profile.family?.numberOfSisters) || 0} sister${Number(profile.family?.numberOfSisters) === 1 ? '' : 's'}`
                            : undefined,
                      },
                      { label: 'Family type', value: profile.family?.familyType },
                      { label: 'Family status', value: profile.family?.familyStatus },
                      { label: 'Family location', value: profile.family?.familyLocation },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl bg-white px-3 py-2.5 shadow-sm">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a6a75]">{item.label}</div>
                        <div className="mt-0.5 truncate text-sm font-bold text-[#2c0d16]" title={item.value || undefined}>{item.value || '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quick actions — scope §16 */}
              <div className="rounded-[28px] border border-[#f2d9a8] bg-[#fffaf2] p-5 shadow-soft">
                <h2 className="text-xl font-black text-[#2c0d16]">Quick actions</h2>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {quickActions.map((action) => (
                    <Link key={action.label} href={action.href} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-left text-sm font-semibold text-[#2c0d16] shadow-sm transition hover:bg-[#fff7ee]">
                      {action.label}
                      <ChevronRight size={14} />
                    </Link>
                  ))}
                </div>
                <label className="mt-2 flex cursor-pointer items-center justify-between rounded-2xl bg-white px-4 py-3 text-left text-sm font-semibold text-[#2c0d16] shadow-sm">
                  <span>{uploadBusy ? 'Uploading…' : 'Upload Horoscope / Kundli'}</span>
                  <input type="file" className="hidden" onChange={handleUpload} />
                  <ChevronRight size={14} />
                </label>
                <div className="mt-2 rounded-2xl bg-white p-3 text-sm text-[#5a3743] shadow-sm">
                  <div className="mb-2 font-semibold text-[#2c0d16]">Schedule consultation</div>
                  <form onSubmit={handleBooking} className="space-y-2">
                    <input type="date" value={bookingForm.date} onChange={(e) => setBookingForm((f) => ({ ...f, date: e.target.value }))} className="w-full rounded-xl border border-[#f2d9a8] px-3 py-2 text-sm" />
                    <select value={bookingForm.time} onChange={(e) => setBookingForm((f) => ({ ...f, time: e.target.value }))} className="w-full rounded-xl border border-[#f2d9a8] px-3 py-2 text-sm">
                      {['09:00 AM', '10:30 AM', '12:00 PM', '02:00 PM', '03:30 PM', '05:00 PM'].map((slot) => (<option key={slot} value={slot}>{slot}</option>))}
                    </select>
                    <textarea value={bookingForm.notes} onChange={(e) => setBookingForm((f) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Notes" className="w-full rounded-xl border border-[#f2d9a8] px-3 py-2 text-sm" />
                    <button type="submit" disabled={bookingBusy} className="w-full rounded-full bg-[#7b102d] px-4 py-2 text-sm font-bold text-white disabled:opacity-70">{bookingBusy ? 'Booking...' : 'Book consultation'}</button>
                    {/* PRD high-priority #2 — same request via WhatsApp, pre-filled
                        with the chosen date / slot / session type. */}
                    <RequestMeetingButton
                      message={buildMeetingRequestMessage({ name: fullName, date: bookingForm.date, time: bookingForm.time, type: bookingForm.type, notes: bookingForm.notes })}
                      label="Or request on WhatsApp"
                      className="w-full"
                    />
                  </form>
                </div>
                <div className="mt-2 rounded-2xl bg-white p-3 text-sm text-[#5a3743] shadow-sm">
                  <div className="font-semibold text-[#2c0d16]">Document status</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full bg-[#fff0cf] px-2 py-1 text-[10px] font-bold uppercase text-[#8a5a11]">{pendingDocs.length} pending</span>
                    <span className="inline-flex rounded-full bg-[#eaf8ef] px-2 py-1 text-[10px] font-bold uppercase text-[#0a7d4c]">{approvedDocs.length} approved</span>
                    <Link href="/customer/documents" className="text-xs font-bold text-[#7b102d] underline">Manage documents</Link>
                  </div>
                </div>
              </div>
            </section>

            {/* Membership tracking — scope §10 */}
            <section id="membership" className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-black text-[#2c0d16]">Membership usage</h2>
                <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase ${membership.active === false ? 'bg-[#ffe5e5] text-[#9b1f2f]' : 'bg-[#eaf8ef] text-[#0a7d4c]'}`}>{membership.active === false ? 'Inactive' : 'Active'}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-[#fff8ee] p-4"><div className="text-xs uppercase tracking-[0.2em] text-[#7b102d]">Plan</div><div className="mt-2 text-xl font-black">{membership.tier || 'Free'}</div><div className="mt-1 text-xs text-[#6a4a57]">Starts {formatExpiry(membership.startedAt)}</div></div>
                <div className="rounded-2xl bg-[#fff8ee] p-4"><div className="text-xs uppercase tracking-[0.2em] text-[#7b102d]">Expiry</div><div className="mt-2 text-xl font-black">{formatExpiry(membership.expiresAt)}</div></div>
                <div className="rounded-2xl bg-[#fff8ee] p-4"><div className="text-xs uppercase tracking-[0.2em] text-[#7b102d]">Meetings</div><div className="mt-2 text-xl font-black">{membership.meetingsUsed ?? 0} used • {membership.meetingsLeft ?? 0} left</div><div className="mt-1 text-xs text-[#6a4a57]">{membership.meetingsAllowed ?? 0} included</div></div>
                <div className="rounded-2xl bg-[#fff8ee] p-4"><div className="text-xs uppercase tracking-[0.2em] text-[#7b102d]">Profiles</div><div className="mt-2 text-xl font-black">{membership.profilesShared ?? 0} shared • {membership.profilesRemaining ?? 0} left</div><div className="mt-1 text-xs text-[#6a4a57]">{membership.profilesAllowed ?? 0} included</div></div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-xl font-black text-[#2c0d16]">Appointments</h2>
                  <Link href="/customer/appointments" className="text-sm font-semibold text-[#7b102d]">{appointments.length} booked</Link>
                </div>
                <div className="space-y-3">
                  {appointments.length === 0 ? <div className="rounded-2xl border border-dashed border-[#f2d9a8] bg-[#fffaf3] p-4 text-sm text-[#5a3743]">No appointments booked yet.</div> : appointments.slice(0, 4).map((item) => (
                    <div key={item.id || `${item.date}-${item.time}`} className="rounded-2xl border border-[#f2d9a8] bg-[#fffaf3] p-4 text-sm text-[#5a3743]">
                      <div className="flex items-center justify-between"><div className="font-bold text-[#2c0d16]">{item.type || 'Consultation'}</div><span className="rounded-full bg-[#eaf8ef] px-2 py-1 text-[10px] font-bold uppercase text-[#0a7d4c]">{item.status || 'Booked'}</span></div>
                      <div className="mt-2">{item.date} • {item.time}</div>
                      {item.notes && <div className="mt-1 text-xs">Note: {item.notes}</div>}
                    </div>
                  ))}
                </div>
              </div>

              {/* 🔔 Realtime Notifications — Supabase Realtime + 30s polling
                  backup. Live badge, mark-all-read, per-event icons. The
                  platform user id scopes the channel client-side; server-side
                  RLS does the real filtering. */}
              <NotificationsPanel userId={platformUserId} initialNotifications={notifications} />
            </section>

            {/* Privacy toggles — hide photo / phone until interest accepted */}
            <section id="settings">
              <PrivacySettings />
            </section>
          </main>
        </div>
      </div>

    </div>
  );
}
