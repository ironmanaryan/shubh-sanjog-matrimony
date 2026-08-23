'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bell, BriefcaseBusiness, CheckCheck, ChevronRight, CreditCard, FileText, Heart, Home, MessageSquare, ShieldCheck, Sparkles, UserRound, Wallet } from 'lucide-react';
import PrivacySettings from '../../components/customer/PrivacySettings';
import { fetchJsonWithFallback, requestJson } from '@/lib/api-client';
import {
  MOCK_APPOINTMENTS_RESPONSE,
  MOCK_DOCUMENTS_RESPONSE,
  MOCK_NOTIFICATIONS_RESPONSE,
  MOCK_PROFILE_RESPONSE,
  MOCK_STATS_RESPONSE,
} from '@/lib/mock-data';

// Customer panel sections from the reference scope document
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
  { label: 'Profile Activity', icon: MessageSquare, href: '#activity' },
  { label: 'Account Settings', icon: ShieldCheck, href: '#settings' },
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

type NotificationItem = { id: string; type: string; at: number; payload?: string };

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
// fetch") resolve silently to realistic mock data via fetchJsonWithFallback()
// instead of crashing or logging intrusive errors.

type ProfileResponse = { profile?: Partial<ProfileData> };
type StatsResponse = { stats?: { membership?: MembershipSummary; recommendedProfiles?: unknown[]; matchesRemaining?: number } };
type DocsResponse = { documents?: DocumentItem[] };
type AppointmentsResponse = { appointments?: Appointment[] };
type NotificationsResponse = { notifications?: NotificationItem[] };

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

function formatExpiry(expiresAt?: number | null) {
  if (!expiresAt) return '—';
  return new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CustomerDashboardPage() {
  const [profile, setProfile] = useState<ProfileData>(defaultProfile);
  const [membership, setMembership] = useState<MembershipSummary>({});
  const [recommendedCount, setRecommendedCount] = useState(0);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [bookingForm, setBookingForm] = useState({ date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), time: '09:00 AM', type: 'Consultation', notes: '' });
  const [bookingBusy, setBookingBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const authHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : null;
  };

  const loadData = async () => {
    const headers = authHeaders();
    if (!headers) {
      setStatusMessage('Please log in to view your dashboard.');
      setLoading(false);
      return;
    }

    // Every request falls back to realistic demo data when the API is
    // unreachable, so one failed endpoint ("TypeError: Failed to fetch") can
    // never blank out the whole dashboard.
    const [profileJson, statsJson, docsJson, appointmentsJson, notificationsJson] = await Promise.all([
      fetchJsonWithFallback<ProfileResponse>('/customer/profile', { headers, mock: MOCK_PROFILE_RESPONSE }),
      fetchJsonWithFallback<StatsResponse>('/dashboard/stats', { headers, mock: MOCK_STATS_RESPONSE }),
      fetchJsonWithFallback<DocsResponse>('/documents', { headers, mock: MOCK_DOCUMENTS_RESPONSE }),
      fetchJsonWithFallback<AppointmentsResponse>('/appointments/my', { headers, mock: MOCK_APPOINTMENTS_RESPONSE }),
      fetchJsonWithFallback<NotificationsResponse>('/notifications', { headers, mock: MOCK_NOTIFICATIONS_RESPONSE }),
    ]);

    if (profileJson.data.profile) {
      setProfile({
        ...defaultProfile,
        ...(profileJson.data.profile as ProfileData),
      });
    }
    if (statsJson.data.stats) {
      const stats = statsJson.data.stats;
      if (stats.membership) setMembership(stats.membership);
      setRecommendedCount(Array.isArray(stats.recommendedProfiles) ? stats.recommendedProfiles.length : Number(stats.matchesRemaining) || 0);
    }
    setDocuments(docsJson.data.documents || []);
    setAppointments(appointmentsJson.data.appointments || []);
    setNotifications(notificationsJson.data.notifications || []);

    // Every endpoint fell back to demo data — API unreachable. Say so gently
    // instead of failing silently or throwing errors.
    if (profileJson.fromMock && statsJson.fromMock && docsJson.fromMock && appointmentsJson.fromMock && notificationsJson.fromMock) {
      setStatusMessage('Offline preview — showing demo data until the API server is reachable.');
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
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
        <div className="mb-6 flex flex-col gap-4 rounded-[28px] border border-[#f1d7a6] bg-white p-5 shadow-soft lg:flex-row lg:items-center lg:justify-between">
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
          <div className="flex items-center gap-3">
            {/* §31: dynamic Profile Completion Score badge */}
            <CompletionRing value={profileCompletion} />
            <Link href="/customer/biodata" className="rounded-full border border-[#e5c88d] bg-[#fffaf0] px-4 py-2 text-sm font-semibold text-[#7b102d]">Edit profile</Link>
            <Link href="/" className="rounded-full bg-[#7b102d] px-4 py-2 text-sm font-semibold text-white">Back to home</Link>
          </div>
        </div>

        {statusMessage && <div className="mb-5 rounded-2xl border border-[#f2d9a8] bg-[#fffaf3] p-3 text-sm text-[#5a3743]">{statusMessage}</div>}

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

              {/* Notifications feed — real data instead of mock activity */}
              <div id="notifications" className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
                <h2 className="text-xl font-black text-[#2c0d16]">Notifications</h2>
                <ul className="mt-5 space-y-3 text-sm text-[#5a3743]">
                  {notifications.length === 0 ? (
                    <li className="rounded-2xl bg-[#fffaf3] p-3">No notifications yet.</li>
                  ) : notifications.slice(0, 6).map((item) => (
                    <li key={item.id} className="flex items-start gap-3 rounded-2xl bg-[#fffaf3] p-3">
                      <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-[#d4a64a]" />
                      <span>
                        <span className="font-semibold capitalize text-[#2c0d16]">{item.type.replace(/_/g, ' ')}</span> — {new Date(item.at).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
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
