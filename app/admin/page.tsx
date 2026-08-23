'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  HeartHandshake,
  LayoutDashboard,
  Lock,
  ShieldCheck,
  StickyNote,
  UsersRound,
  XCircle,
} from 'lucide-react';
import AdminSignInGate from '@/components/admin/AdminSignInGate';
import { clearSession, getSession, isNetworkError } from '@/lib/auth-client';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

// Consolidated admin panel (scope PDF §18–§31): one route with permission-gated
// tabs — Profile Review, Document Verification, UPI Payment Approvals, Matching
// Management, Reports & Analytics. RBAC (§29) hides/restricts tabs per role.
type TabKey = 'overview' | 'profiles' | 'documents' | 'payments' | 'matchmaking' | 'analytics';

type Role = string;

type Permissions = {
  viewQueues: boolean;
  reviewProfiles: boolean;
  verifyPayments: boolean;
  manageMatches: boolean;
  viewAnalytics: boolean;
  exportAnalytics: boolean;
  addNotes: boolean;
  manageTeam: boolean;
};

const NO_PERMISSIONS: Permissions = {
  viewQueues: false,
  reviewProfiles: false,
  verifyPayments: false,
  manageMatches: false,
  viewAnalytics: false,
  exportAnalytics: false,
  addNotes: false,
  manageTeam: false,
};

// Mirrors server RBAC §29 admin matrix — used for cached/offline fallback
// sessions where /admin/me could not be reached to confirm permissions.
const FULL_PERMISSIONS: Permissions = {
  viewQueues: true,
  reviewProfiles: true,
  verifyPayments: true,
  manageMatches: true,
  viewAnalytics: true,
  exportAnalytics: true,
  addNotes: true,
  manageTeam: true,
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  relationship_manager: 'Relationship Manager',
  staff: 'Staff',
  customer: 'Customer',
};

const ASSIGNABLE_ROLES = ['admin', 'relationship_manager', 'staff', 'customer'];

const ALL_TABS: { key: TabKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'profiles', label: 'Profile Review', icon: FileText },
  { key: 'documents', label: 'Document Verification', icon: ShieldCheck },
  { key: 'payments', label: 'UPI Payment Approvals', icon: CreditCard },
  { key: 'matchmaking', label: 'Matching Management', icon: HeartHandshake },
  { key: 'analytics', label: 'Reports & Analytics', icon: BarChart3 },
];

type Me = { id: string; identifier: string; role: Role; permissions: Permissions };

type AdminStats = {
  totalCustomers: number;
  newCustomers: number;
  activeMembers: number;
  pendingDocuments: number;
  approvedDocuments: number;
  rejectedDocuments: number;
  pendingProfiles?: number;
  approvedProfiles?: number;
  rejectedProfiles?: number;
  profilesCreated: number;
  avgProfileCompletion: number;
  upcomingAppointments: number;
  completedAppointments: number;
  totalAppointments: number;
  pendingPayments?: number;
  approvedPayments?: number;
  rejectedPayments?: number;
  activeGoldMemberships?: number;
  activePremiumMemberships?: number;
  expiringMemberships?: number;
  revenueApproved?: number;
};

type Attention = {
  pendingDocuments: { id: string; originalName?: string; uploadedAt?: number; customerName?: string }[];
  pendingProfiles?: { id: string; customerName?: string; submittedAt?: number; profileCompletion?: number }[];
  upcomingAppointments: { id: string; date?: string; time?: string; type?: string; customerName?: string }[];
  recentCustomers: { id: string; identifier?: string; createdAt?: number }[];
  pendingPayments?: { id: string; plan?: string; amount?: number; createdAt?: number; customerName?: string }[];
};

type ProfileReviewRow = {
  userId: string;
  name: string;
  identifier: string;
  gender: string;
  age: number | null;
  city: string;
  religion: string;
  profession: string;
  status: string;
  profileCompletion: number;
  reviewNote: string | null;
  submittedAt: number | null;
};

type DocRow = {
  id: string;
  customerId: string;
  customerName: string;
  documentType: string | null;
  status: string;
  rejectionReason: string | null;
  originalName: string;
  uploadedAt: number;
};

type PaymentRow = {
  id: string;
  userId: string;
  customerName: string;
  customerIdentifier: string;
  plan: string;
  amount: number;
  upiId: string | null;
  utr: string;
  status: string;
  rejectionReason: string | null;
  receiptName: string | null;
  hasReceipt: boolean;
  createdAt: number;
};

type Candidate = {
  id: string;
  name: string;
  age: number;
  city: string;
  religion: string;
  gender: string;
  profession: string;
  highestQualification?: string;
  caste?: string;
  state?: string;
  profileCompletion?: number;
  profileStatus?: string;
  verifiedBadge?: boolean;
};

type CustomerPreferences = {
  preferredGender?: string;
  minAge?: number | string;
  maxAge?: number | string;
  religion?: string;
  caste?: string;
  motherTongue?: string;
  location?: string;
  education?: string;
  profession?: string;
};

type CustomerRow = {
  id: string;
  identifier: string;
  profileStatus?: string;
  profileCompletion?: number;
  preferences?: CustomerPreferences;
};

type AssignmentRow = {
  id: string;
  customerId: string;
  candidateId: string;
  customerName?: string;
  candidateName?: string;
  interestStatus?: string;
  note?: string;
  assignedAt: number;
};

type Analytics = {
  revenue: { consultation: number; memberships: number; gold: number; premium: number; total: number; approvedPaymentsCount: number };
  activePlans: { consultation: number; gold: number; premium: number; total: number };
  appointments: { total: number; booked: number; completed: number; cancelled: number; upcoming: number };
  paymentsByStatus: { approved: number; pending: number; rejected: number };
  customers: { total: number };
};

type TeamMember = { id: string; identifier: string; role: string; createdAt?: number };

type InternalNote = { id: string; targetType: string; targetId: string; note: string; createdAt: number; authorIdentifier?: string };

type MatchFilters = {
  gender: string;
  minAge: string;
  maxAge: string;
  religion: string;
  caste: string;
  education: string;
  location: string;
  profileStatus: string;
};

const EMPTY_FILTERS: MatchFilters = { gender: '', minAge: '', maxAge: '', religion: '', caste: '', education: '', location: '', profileStatus: '' };

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function openPrivateFile(url: string) {
  // Private documents/receipts are streamed behind JWT — never public URLs.
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('File unavailable');
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

const badge = (status: string) => {
  if (/approved/i.test(status)) return 'bg-[#eaf8ef] text-[#0a7d4c]';
  if (/reject/i.test(status)) return 'bg-[#ffe5e5] text-[#9b1f2f]';
  return 'bg-[#fff0cf] text-[#8a5a11]';
};

// §30/§31: Verified Profile badge driven by the admin-approved profile status
function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#eaf8ef] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0a7d4c]">
      <ShieldCheck size={11} /> Verified Profile
    </span>
  ) : (
    <span className="rounded-full bg-[#f4e9ee] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8a5a6b]">Unverified</span>
  );
}

// §27: live interest status between an assigned pair
function InterestBadge({ status }: { status?: string | null }) {  const map: Record<string, string> = {
    Accepted: 'bg-[#eaf8ef] text-[#0a7d4c]',
    Pending: 'bg-[#fff0cf] text-[#8a5a11]',
    Rejected: 'bg-[#ffe5e5] text-[#9b1f2f]',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${map[status || 'None'] || 'bg-[#f1ece7] text-[#6a4a57]'}`}>
      {status || 'None'}
    </span>
  );
}

// Reads the live pair status the matching search annotates onto candidates
function interestStatusFor(candidate?: Candidate): string | null {
  const annotated = candidate as (Candidate & { interestStatusFromCaller?: string | null }) | undefined;
  return annotated?.interestStatusFromCaller ?? null;
}

export default function AdminPage() {
  const [tab, setTab] = useState<TabKey>('overview');
  const [me, setMe] = useState<Me | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [attention, setAttention] = useState<Attention>({ pendingDocuments: [], upcomingAppointments: [], recentCustomers: [] });

  const [profiles, setProfiles] = useState<ProfileReviewRow[]>([]);
  const [profileStatusFilter, setProfileStatusFilter] = useState('Submitted');

  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [assignForm, setAssignForm] = useState({ customerId: '', candidateId: '', note: '' });

  // §27 Matching Management workspace
  const [matchCustomerId, setMatchCustomerId] = useState('');
  const [matchFilters, setMatchFilters] = useState<MatchFilters>(EMPTY_FILTERS);
  const [matchedCandidates, setMatchedCandidates] = useState<Candidate[]>([]);
  const [lastMatchingQuery, setLastMatchingQuery] = useState('');
  const [matchingBusy, setMatchingBusy] = useState(false);

  // §28 Reports & Analytics
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  // §29 Team & role management
  const [team, setTeam] = useState<TeamMember[]>([]);

  // §31 internal notes drawer target: `${targetType}:${targetId}`
  const [notesFor, setNotesFor] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [offlineMode, setOfflineMode] = useState(false);

  const perms = me?.permissions || NO_PERMISSIONS;

  // Bootstrap: identify the signed-in staff user and their effective
  // permissions (RBAC §29).
  //
  // Fallback ladder so /admin always opens cleanly:
  //   1. Token + /admin/me OK            → full panel.
  //   2. Server rejects OR unreachable,
  //      but a cached admin session
  //      exists                          → degraded offline panel (read-only UI,
  //                                        live queues simply stay empty).
  //   3. No/invalid session              → inline admin sign-in card (OTP),
  //                                        no dead-end redirect.
  useEffect(() => {
    const { token, user } = getSession();
    const cachedRole: string | undefined = user?.role;
    const cachedIsAdmin =
      cachedRole === 'admin' || Boolean(user?.identifier && user.identifier.toLowerCase().includes('admin'));

    if (!token) {
      setIsAdmin(false);
      return;
    }

    let settled = false;

    fetch(`${API}/admin/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        settled = true;
        if (!res.ok) {
          // Expired/invalid token — drop it, but keep admins in via the cached
          // identity instead of bouncing them to a dead end.
          if (cachedIsAdmin) {
            setMe({
              id: user?.id || 'offline-admin',
              identifier: user?.identifier || 'admin',
              role: 'admin',
              permissions: FULL_PERMISSIONS,
            });
            setIsAdmin(true);
            setOfflineMode(true);
          } else {
            clearSession();
            setIsAdmin(false);
          }
          return;
        }
        const json = await res.json();
        if (json.me && !json.me.permissions) json.me.permissions = FULL_PERMISSIONS;
        setMe(json.me || null);
        setIsAdmin(true);
      })
      .catch((err) => {
        settled = true;
        if (cachedIsAdmin && isNetworkError(err)) {
          // API offline — open the panel from the cached session.
          setMe({
            id: user?.id || 'offline-admin',
            identifier: user?.identifier || 'admin',
            role: 'admin',
            permissions: FULL_PERMISSIONS,
          });
          setIsAdmin(true);
          setOfflineMode(true);
        } else {
          setIsAdmin(false);
        }
      });

    // Safety net: never leave the panel stuck on "Loading…" if the request hangs.
    const timeout = setTimeout(() => {
      if (!settled && cachedIsAdmin) {
        setMe({
          id: user?.id || 'offline-admin',
          identifier: user?.identifier || 'admin',
          role: 'admin',
          permissions: FULL_PERMISSIONS,
        });
        setIsAdmin(true);
        setOfflineMode(true);
      }
    }, 8000);

    return () => clearTimeout(timeout);
  }, []);

  async function runMatchingSearch(query: string) {
    setMatchingBusy(true);
    try {
      const res = await fetch(`${API}/admin/matching/candidates${query ? `?${query}` : ''}`, { headers: authHeaders() });
      const json = await res.json();
      if (res.ok) setMatchedCandidates(json.candidates || []);
      else setMessage(json.error || 'Could not filter candidates');
    } catch {
      setMessage('Could not filter candidates');
    } finally {
      setMatchingBusy(false);
    }
  }

  function applyPreferenceFilters(customerId = matchCustomerId, filters = matchFilters) {
    const params = new URLSearchParams();
    if (customerId) params.set('customerId', customerId);
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== undefined && value !== null) params.set(key, String(value));
    });
    const query = params.toString();
    setLastMatchingQuery(query);
    void runMatchingSearch(query);
  }

  function selectMatchCustomer(id: string) {
    setMatchCustomerId(id);
    // Prefill the filter panel with the customer's saved partner preferences (§27)
    const customer = customers.find((c) => c.id === id);
    if (customer?.preferences) {
      const p = customer.preferences;
      const next: MatchFilters = {
        gender: p.preferredGender === 'Female' ? 'female' : p.preferredGender === 'Male' ? 'male' : '',
        minAge: p.minAge !== undefined && p.minAge !== null && p.minAge !== '' ? String(p.minAge) : '',
        maxAge: p.maxAge !== undefined && p.maxAge !== null && p.maxAge !== '' ? String(p.maxAge) : '',
        religion: p.religion || '',
        caste: p.caste || '',
        education: p.education || p.profession || '',
        location: p.location || '',
        profileStatus: 'Approved',
      };
      setMatchFilters(next);
      applyPreferenceFilters(id, next);
    } else {
      applyPreferenceFilters(id, matchFilters);
    }
  }

  const loadTab = useCallback(
    async (key: TabKey) => {
      setMessage('');
      try {
        if (key === 'profiles') {
          const res = await fetch(`${API}/admin/profiles?status=${encodeURIComponent(profileStatusFilter)}`, { headers: authHeaders() });
          const json = await res.json();
          if (res.ok) setProfiles(json.profiles || []);
        }
        if (key === 'documents') {
          const res = await fetch(`${API}/admin/documents`, { headers: authHeaders() });
          const json = await res.json();
          if (res.ok) setDocuments(json.documents || []);
        }
        if (key === 'payments') {
          const res = await fetch(`${API}/admin/payments`, { headers: authHeaders() });
          const json = await res.json();
          if (res.ok) setPayments(json.payments || []);
        }
        if (key === 'overview' && perms.manageTeam) {
          const res = await fetch(`${API}/admin/team`, { headers: authHeaders() });
          const json = await res.json();
          if (res.ok) setTeam(json.team || []);
        }
        if (key === 'matchmaking') {
          const [customersRes, candidatesRes, assignmentsRes] = await Promise.all([
            fetch(`${API}/admin/customers`, { headers: authHeaders() }),
            fetch(`${API}/admin/candidates`, { headers: authHeaders() }),
            fetch(`${API}/admin/match-assignments`, { headers: authHeaders() }),
          ]);
          if (customersRes.ok) setCustomers((await customersRes.json()).customers || []);
          if (candidatesRes.ok) setCandidates((await candidatesRes.json()).candidates || []);
          if (assignmentsRes.ok) setAssignments((await assignmentsRes.json()).assignments || []);
          // keep previously-filtered results fresh after actions
          if (lastMatchingQuery) void runMatchingSearch(lastMatchingQuery);
        }
        if (key === 'analytics') {
          const res = await fetch(`${API}/admin/analytics`, { headers: authHeaders() });
          const json = await res.json();
          if (res.ok) setAnalytics(json.analytics || null);
        }
      } catch (err) {
        console.error(err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profileStatusFilter, perms.manageTeam, lastMatchingQuery]
  );

  useEffect(() => {
    if (isAdmin && perms.viewQueues && !stats) {
      fetch(`${API}/admin/stats`, { headers: authHeaders() })
        .then(async (res) => {
          if (!res.ok) return;
          const json = await res.json();
          setStats(json.stats || null);
          setAttention(json.attention || { pendingDocuments: [], upcomingAppointments: [], recentCustomers: [] });
        })
        .catch(() => undefined);
    }
    if (isAdmin) loadTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, tab, loadTab]);

  async function act(action: () => Promise<Response>, successMessage: string) {
    setBusy(true);
    setMessage('');
    try {
      const res = await action();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Action failed');
      setMessage(successMessage);
      await loadTab(tab);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function updateTeamRole(userId: string, role: string) {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch(`${API}/admin/team/role`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ userId, role }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not update role');
      setMessage(`Role updated to ${ROLE_LABELS[role] || role}`);
      await loadTab('overview');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  // §28 CSV Export — downloads the analytics workbook-style CSV
  async function exportCsv() {
    setMessage('');
    try {
      const res = await fetch(`${API}/admin/analytics/export`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `shubh-sanjog-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      setMessage('Analytics exported to CSV.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Export failed');
    }
  }

  if (isAdmin === false) {
    // Fallback auth: inline OTP sign-in so /admin never dead-ends. Admins land
    // here when no/invalid session exists; customers are pointed home.
    return <AdminSignInGate />;
  }

  if (isAdmin === null) {
    return <div className="min-h-screen bg-[#fffaf8] px-4 py-12 text-[#2c0d16]">Loading admin panel…</div>;
  }

  const visibleTabs = ALL_TABS.filter(({ key }) => {
    if (key === 'overview') return true;
    if (key === 'analytics') return perms.viewAnalytics;
    return perms.viewQueues;
  });

  const metrics: { label: string; value: string }[] = stats
    ? [
        { label: 'Total Customers', value: String(stats.totalCustomers) },
        { label: 'New Customers (7d)', value: String(stats.newCustomers) },
        { label: 'Active Members', value: String(stats.activeMembers) },
        { label: 'Active Gold', value: String(stats.activeGoldMemberships ?? 0) },
        { label: 'Active Premium', value: String(stats.activePremiumMemberships ?? 0) },
        { label: 'Expiring (7d)', value: String(stats.expiringMemberships ?? 0) },
        { label: 'Revenue (Approved)', value: `₹${Number(stats.revenueApproved ?? 0).toLocaleString('en-IN')}` },
        { label: 'Pending Profiles', value: String(stats.pendingProfiles ?? 0) },
        { label: 'Pending Documents', value: String(stats.pendingDocuments) },
        { label: 'Pending Payments', value: String(stats.pendingPayments ?? 0) },
        { label: 'Upcoming Appointments', value: String(stats.upcomingAppointments) },
        { label: 'Avg. Profile Completion', value: `${stats.avgProfileCompletion}%` },
      ]
    : [];

  const rupees = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

  return (
    <div className="min-h-screen bg-[#fffaf8] px-4 py-6 text-[#2c0d16] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 rounded-[28px] border border-[#f1d7a6] bg-white p-5 shadow-soft">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#7b102d]">Admin panel</p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">Shubh Sanjog Operations</h1>
              {/* RBAC §29 — signed-in identity + role */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#fff1dc] px-3 py-1 font-bold uppercase tracking-wide text-[#7b102d]">
                  <UsersRound size={12} /> {ROLE_LABELS[me?.role || ''] || 'Staff'}
                </span>
                <span className="text-[#6a4a57]">{me?.identifier}</span>
                {!perms.reviewProfiles || !perms.verifyPayments ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#f4e9ee] px-2 py-1 font-bold uppercase tracking-wide text-[#8a5a6b]">
                    <Lock size={11} /> Restricted access
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/admin/inquiries" className="rounded-full border border-[#e5c88d] bg-[#fffaf0] px-4 py-2 text-center text-sm font-semibold text-[#7b102d] transition hover:bg-[#fff3dd]">Inquiries</Link>
              <Link href="/" className="rounded-full border border-[#e5c88d] bg-[#fffaf0] px-4 py-2 text-center text-sm font-semibold text-[#7b102d]">Back to site</Link>
            </div>
          </div>

          {/* Workflow tabs */}
          <nav className="mt-5 flex flex-wrap gap-2">
            {visibleTabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${
                  tab === key ? 'bg-[#7b102d] text-white shadow-lg shadow-[#7b102d]/20' : 'border border-[#e9d4a3] bg-white text-[#4d2c36] hover:bg-[#fff7ee]'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {offlineMode && (
          <div className="mb-5 flex flex-wrap items-center gap-2.5 rounded-2xl border border-[#f0d9a0] bg-[#fff8e6] px-4 py-3 text-sm font-medium text-[#8a5a11]">
            <ShieldCheck size={16} className="shrink-0" />
            <span>
              Offline mode — the API server isn&apos;t responding, so the panel opened from your
              cached admin session. Live queues will populate once the server is reachable.
            </span>
          </div>
        )}

        {message && <div className="mb-5 rounded-2xl border border-[#f2d8a8] bg-[#fffaf3] p-3 text-sm text-[#5a3743]">{message}</div>}

        {/* ---------------- Overview ---------------- */}
        {tab === 'overview' && (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {(metrics.length === 0
                ? Array.from({ length: 8 }, () => ({ label: 'Loading…', value: '—' }))
                : metrics
              ).map((metric, index) => (
                <div key={`${metric.label}-${index}`} className="rounded-[24px] border border-[#f2d8a8] bg-white p-5 shadow-soft">
                  <div className="text-sm text-[#5a3743]">{metric.label}</div>
                  <div className="mt-3 truncate text-3xl font-black" title={metric.value}>{metric.value}</div>
                </div>
              ))}
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-2">
              <div className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
                <h2 className="mb-4 text-lg font-black">Attention required</h2>
                <ul className="space-y-2 text-sm text-[#5a3743]">
                  {(attention.pendingPayments || []).map((payment) => (
                    <li key={`pay-${payment.id}`} className="rounded-2xl bg-[#fffaf3] p-3">
                      UPI payment — <strong>{payment.customerName}</strong>: {payment.plan} ({rupees(Number(payment.amount || 0))})
                    </li>
                  ))}
                  {(attention.pendingProfiles || []).map((profile) => (
                    <li key={`prof-${profile.id}`} className="rounded-2xl bg-[#fffaf3] p-3">
                      Profile review — <strong>{profile.customerName}</strong> ({profile.profileCompletion ?? 0}% complete)
                    </li>
                  ))}
                  {attention.pendingDocuments.map((doc) => (
                    <li key={`doc-${doc.id}`} className="rounded-2xl bg-[#fffaf3] p-3">
                      Document — <strong>{doc.customerName}</strong>: {doc.originalName}
                    </li>
                  ))}
                  {(attention.pendingPayments?.length ?? 0) + (attention.pendingProfiles?.length ?? 0) + attention.pendingDocuments.length === 0 && (
                    <li className="rounded-2xl bg-[#fffaf3] p-3">Nothing pending. All queues are clear.</li>
                  )}
                </ul>
              </div>

              <div className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
                <h2 className="mb-4 text-lg font-black">Upcoming appointments</h2>
                <ul className="space-y-2 text-sm text-[#5a3743]">
                  {attention.upcomingAppointments.length === 0 ? (
                    <li className="rounded-2xl bg-[#fffaf3] p-3">No upcoming appointments.</li>
                  ) : attention.upcomingAppointments.map((appointment) => (
                    <li key={appointment.id} className="rounded-2xl bg-[#fffaf3] p-3">
                      <strong>{appointment.customerName}</strong> — {appointment.date} • {appointment.time} ({appointment.type || 'Consultation'})
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* RBAC §29 — team & role management (admin only) */}
            {perms.manageTeam && (
              <section className="mt-6 rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
                <h2 className="mb-1 text-lg font-black">Team &amp; Roles</h2>
                <p className="mb-4 text-sm text-[#5a3743]">Admin has full access. Relationship Managers can review profiles and manage matches. Staff have read-only queues plus analytics.</p>
                <div className="overflow-hidden rounded-2xl border border-[#f2d9a8]">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#fff8ee] text-[#5f3d49]">
                      <tr>
                        <th className="px-4 py-3 font-bold">User</th>
                        <th className="px-4 py-3 font-bold">Role</th>
                        <th className="px-4 py-3 font-bold">Change role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.length === 0 ? (
                        <tr className="border-t border-[#f2d9a8] bg-white">
                          <td colSpan={3} className="px-4 py-4 text-center text-[#5a3743]">No users found.</td>
                        </tr>
                      ) : (
                        team.map((member) => (
                          <tr key={member.id} className="border-t border-[#f2d9a8] bg-white">
                            <td className="px-4 py-3">
                              <div className="font-semibold">{member.identifier}</div>
                              <div className="font-mono text-xs text-[#6a4a57]">{member.id.slice(0, 8)}…</div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${member.role === 'admin' ? 'bg-[#7b102d] text-white' : member.role === 'customer' ? 'bg-[#f1ece7] text-[#6a4a57]' : 'bg-[#fff0cf] text-[#8a5a11]'}`}>
                                {ROLE_LABELS[member.role] || member.role}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {member.id === me?.id ? (
                                <span className="text-xs italic text-[#6a4a57]">This is you</span>
                              ) : (
                                <select
                                  value={ASSIGNABLE_ROLES.includes(member.role) ? member.role : 'customer'}
                                  disabled={busy}
                                  onChange={(e) => updateTeamRole(member.id, e.target.value)}
                                  className="rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2 text-sm"
                                >
                                  {ASSIGNABLE_ROLES.map((r) => (
                                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                                  ))}
                                </select>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}

        {/* ---------------- Profile Review ---------------- */}
        {tab === 'profiles' && (
          <div className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black">Profile Review queue</h2>
              <div className="flex items-center gap-2">
                {!perms.reviewProfiles && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#f4e9ee] px-3 py-1 text-xs font-bold uppercase text-[#8a5a6b]"><Lock size={12} /> Read-only</span>
                )}
                <select
                  value={profileStatusFilter}
                  onChange={(e) => setProfileStatusFilter(e.target.value)}
                  className="rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2 text-sm"
                >
                  {['Submitted', 'Under Review', 'Approved', 'Rejected', 'Draft'].map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>

            {profiles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#f2d9a8] bg-[#fffaf3] p-4 text-sm text-[#5a3743]">No profiles with status “{profileStatusFilter}”.</div>
            ) : (
              <div className="space-y-3">
                {profiles.map((row) => (
                  <div key={row.userId} className="rounded-2xl border border-[#f2d9a8] bg-[#fffaf3] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 font-black">
                          {row.name} <span className="text-xs font-medium text-[#6a4a57]">{row.identifier}</span>
                          <VerifiedBadge verified={row.status === 'Approved'} />
                        </div>
                        <div className="mt-1 text-sm text-[#5a3743]">
                          {row.gender || '—'} • {row.age ?? '—'} yrs • {row.city || '—'} • {row.religion || '—'} • {row.profession || '—'}
                        </div>
                        <div className="mt-1 text-xs text-[#6a4a57]">
                          Completion {row.profileCompletion}%
                          {typeof row.profileCompletion === 'number' && (
                            <span className="ml-2 inline-block h-1.5 w-24 overflow-hidden rounded-full bg-[#efe2d2] align-middle">
                              <span className={`block h-full ${row.profileCompletion >= 70 ? 'bg-[#0a7d4c]' : 'bg-[#d4a64a]'}`} style={{ width: `${Math.max(0, Math.min(100, row.profileCompletion))}%` }} />
                            </span>
                          )}
                          {row.reviewNote ? ` • Note: ${row.reviewNote}` : ''}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${badge(row.status)}`}>{row.status}</span>
                        <button onClick={() => setNotesFor(notesFor === `profile:${row.userId}` ? null : `profile:${row.userId}`)} className="inline-flex items-center gap-1 rounded-full border border-[#d4a64a] bg-white px-3 py-1.5 text-xs font-bold text-[#7b102d]">
                          <StickyNote size={12} /> Notes
                        </button>
                        {perms.reviewProfiles && (
                          <>
                            <button
                              disabled={busy}
                              onClick={() => act(() => fetch(`${API}/admin/profiles/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ userId: row.userId }) }), 'Profile approved')}
                              className="rounded-full bg-[#0a7d4c] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                            >
                              Approve
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => {
                                const reason = window.prompt('Rejection reason:');
                                if (!reason) return;
                                act(() => fetch(`${API}/admin/profiles/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ userId: row.userId, reason }) }), 'Profile rejected');
                              }}
                              className="rounded-full bg-[#9b1f2f] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                            >
                              Reject
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => {
                                const note = window.prompt('Changes requested:');
                                if (!note) return;
                                act(() => fetch(`${API}/admin/profiles/request-changes`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ userId: row.userId, note }) }), 'Change request sent');
                              }}
                              className="rounded-full border border-[#d4a64a] px-3 py-1.5 text-xs font-bold text-[#7b102d] disabled:opacity-60"
                            >
                              Request changes
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {notesFor === `profile:${row.userId}` && <NotesPanel targetType="profile" targetId={row.userId} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---------------- Document Verification ---------------- */}
        {tab === 'documents' && (
          <div className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black">Document Verification queue</h2>
              {!perms.reviewProfiles && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#f4e9ee] px-3 py-1 text-xs font-bold uppercase text-[#8a5a6b]"><Lock size={12} /> Read-only</span>
              )}
            </div>
            {documents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#f2d9a8] bg-[#fffaf3] p-4 text-sm text-[#5a3743]">No documents uploaded yet.</div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div key={doc.id} className="rounded-2xl border border-[#f2d9a8] bg-[#fffaf3] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="font-bold">{doc.originalName}</div>
                        <div className="text-xs text-[#6a4a57]">
                          {doc.customerName} • {doc.documentType || 'document'} • {new Date(doc.uploadedAt).toLocaleDateString()}
                          {doc.rejectionReason ? ` • Rejection reason: ${doc.rejectionReason}` : ''}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${badge(doc.status)}`}>{doc.status}</span>
                        <button onClick={() => openPrivateFile(`${API}/documents/${doc.id}`).catch((e) => setMessage(e.message))} className="rounded-full border border-[#d4a64a] bg-white px-3 py-1.5 text-xs font-bold text-[#7b102d]">View securely</button>
                        <button onClick={() => setNotesFor(notesFor === `document:${doc.id}` ? null : `document:${doc.id}`)} className="inline-flex items-center gap-1 rounded-full border border-[#d4a64a] bg-white px-3 py-1.5 text-xs font-bold text-[#7b102d]">
                          <StickyNote size={12} /> Notes
                        </button>
                        {perms.reviewProfiles && (
                          <>
                            <button
                              disabled={busy}
                              onClick={() => act(() => fetch(`${API}/admin/documents/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ id: doc.id }) }), 'Document approved')}
                              className="rounded-full bg-[#0a7d4c] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                            >
                              Approve
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => {
                                const reason = window.prompt('Rejection reason:');
                                if (!reason) return;
                                act(() => fetch(`${API}/admin/documents/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ id: doc.id, reason }) }), 'Document rejected');
                              }}
                              className="rounded-full bg-[#9b1f2f] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {notesFor === `document:${doc.id}` && <NotesPanel targetType="document" targetId={doc.id} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---------------- UPI Payment Approvals ---------------- */}
        {tab === 'payments' && (
          <div className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black">UPI Payment Approvals</h2>
              {!perms.verifyPayments && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#f4e9ee] px-3 py-1 text-xs font-bold uppercase text-[#8a5a6b]"><Lock size={12} /> Admin-only verification</span>
              )}
            </div>
            {payments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#f2d9a8] bg-[#fffaf3] p-4 text-sm text-[#5a3743]">No payments submitted yet.</div>
            ) : (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div key={payment.id} className="rounded-2xl border border-[#f2d9a8] bg-[#fffaf3] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-black">{payment.customerName} — {payment.plan} ({rupees(Number(payment.amount))})</div>
                        <div className="mt-1 text-xs text-[#6a4a57]">
                          UTR: <span className="font-mono">{payment.utr}</span> • Paid to {payment.upiId} • {new Date(payment.createdAt).toLocaleString()}
                          {payment.rejectionReason ? ` • Reason: ${payment.rejectionReason}` : ''}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-bold uppercase ${badge(payment.status)}`}>
                          {/approved/i.test(payment.status) ? <CheckCircle2 size={12} /> : /reject/i.test(payment.status) ? <XCircle size={12} /> : null}
                          {payment.status}
                        </span>
                        {payment.hasReceipt && (
                          <button onClick={() => openPrivateFile(`${API}/admin/payments/${payment.id}/receipt`).catch((e) => setMessage(e.message))} className="rounded-full border border-[#d4a64a] bg-white px-3 py-1.5 text-xs font-bold text-[#7b102d]">
                            View receipt
                          </button>
                        )}
                        <button onClick={() => setNotesFor(notesFor === `payment:${payment.id}` ? null : `payment:${payment.id}`)} className="inline-flex items-center gap-1 rounded-full border border-[#d4a64a] bg-white px-3 py-1.5 text-xs font-bold text-[#7b102d]">
                          <StickyNote size={12} /> Notes
                        </button>
                        {perms.verifyPayments && payment.status === 'Pending Verification' && (
                          <>
                            <button
                              disabled={busy}
                              onClick={() => act(() => fetch(`${API}/admin/payments/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ id: payment.id }) }), 'Payment verified & membership activated')}
                              className="rounded-full bg-[#0a7d4c] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                            >
                              Verify &amp; activate
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => {
                                const reason = window.prompt('Reason (UTR mismatch etc.):');
                                if (!reason) return;
                                act(() => fetch(`${API}/admin/payments/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ id: payment.id, reason }) }), 'Payment rejected');
                              }}
                              className="rounded-full bg-[#9b1f2f] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {notesFor === `payment:${payment.id}` && <NotesPanel targetType="payment" targetId={payment.id} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---------------- Matching Management (§27) ---------------- */}
        {tab === 'matchmaking' && (
          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              {/* Preference-based filtering workspace */}
              <div className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
                <h2 className="mb-1 text-xl font-black">Find candidates by preference</h2>
                <p className="mb-4 text-sm text-[#5a3743]">Pick a customer to prefill their saved partner preferences, adjust filters, then assign the best-fit profile.</p>

                <label className="block text-sm font-semibold">Customer</label>
                <select
                  value={matchCustomerId}
                  onChange={(e) => selectMatchCustomer(e.target.value)}
                  className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2 text-sm"
                >
                  <option value="">All customers (manual filters)</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.identifier}{customer.profileCompletion ? ` (${customer.profileCompletion}% profile)` : ''}
                    </option>
                  ))}
                </select>
                {matchCustomerId ? (
                  <Link href={`/admin/customers/${matchCustomerId}`} className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-[#7b102d] underline underline-offset-2">
                    Open customer workspace (profile, family details &amp; internal notes)
                  </Link>
                ) : null}

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#5a3743]">Gender</label>
                    <select value={matchFilters.gender} onChange={(e) => setMatchFilters((f) => ({ ...f, gender: e.target.value }))} className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2 text-sm">
                      <option value="">Any</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#5a3743]">Min age</label>
                    <input type="number" min={18} value={matchFilters.minAge} onChange={(e) => setMatchFilters((f) => ({ ...f, minAge: e.target.value }))} className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#5a3743]">Max age</label>
                    <input type="number" min={18} value={matchFilters.maxAge} onChange={(e) => setMatchFilters((f) => ({ ...f, maxAge: e.target.value }))} className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#5a3743]">Religion</label>
                    <input placeholder="e.g., Hindu" value={matchFilters.religion} onChange={(e) => setMatchFilters((f) => ({ ...f, religion: e.target.value }))} className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#5a3743]">Caste / Community</label>
                    <input placeholder="e.g., Brahmin" value={matchFilters.caste} onChange={(e) => setMatchFilters((f) => ({ ...f, caste: e.target.value }))} className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#5a3743]">Education / Profession</label>
                    <input placeholder="e.g., Engineer" value={matchFilters.education} onChange={(e) => setMatchFilters((f) => ({ ...f, education: e.target.value }))} className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#5a3743]">Location</label>
                    <input placeholder="City or state" value={matchFilters.location} onChange={(e) => setMatchFilters((f) => ({ ...f, location: e.target.value }))} className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#5a3743]">Profile status</label>
                    <select value={matchFilters.profileStatus} onChange={(e) => setMatchFilters((f) => ({ ...f, profileStatus: e.target.value }))} className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2 text-sm">
                      <option value="">Any status</option>
                      {['Approved', 'Under Review', 'Submitted', 'Rejected', 'Draft'].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end gap-2">
                    <button onClick={() => applyPreferenceFilters()} disabled={matchingBusy} className="flex-1 rounded-full bg-[#7b102d] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                      {matchingBusy ? 'Filtering…' : 'Apply filters'}
                    </button>
                    <button onClick={() => { setMatchFilters(EMPTY_FILTERS); setLastMatchingQuery(''); void runMatchingSearch(matchCustomerId ? `customerId=${encodeURIComponent(matchCustomerId)}` : ''); }} className="rounded-full border border-[#e5c88d] px-3 py-2 text-sm font-semibold text-[#7b102d]">
                      Reset
                    </button>
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  <div className="flex items-center justify-between text-sm font-bold text-[#5a3743]">
                    <span>Candidate matches</span>
                    <span className="text-xs font-medium text-[#6a4a57]">{matchedCandidates.length} result(s)</span>
                  </div>
                  {matchedCandidates.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#f2d9a8] bg-[#fffaf3] p-4 text-sm text-[#5a3743]">
                      {matchingBusy ? 'Filtering profiles…' : lastMatchingQuery ? 'No candidates match these preferences.' : 'Choose filters and press “Apply filters”.'}
                    </div>
                  ) : (
                    matchedCandidates.map((candidate) => (
                      <div key={candidate.id} className="rounded-2xl border border-[#f2d9a8] bg-[#fffaf3] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 font-bold">
                              {candidate.name}
                              <VerifiedBadge verified={candidate.verifiedBadge === true} />
                            </div>
                            <div className="mt-0.5 text-xs text-[#6a4a57]">
                              {candidate.gender || '—'} • {candidate.age ?? '—'} yrs • {candidate.city || '—'}
                              {candidate.state ? `, ${candidate.state}` : ''} • {[candidate.highestQualification, candidate.profession].filter(Boolean).join(' / ') || '—'}
                            </div>
                            <div className="mt-1 text-xs text-[#6a4a57]">
                              Completion{' '}
                              <span className={`font-bold ${Number(candidate.profileCompletion) >= 70 ? 'text-[#0a7d4c]' : 'text-[#8a5a11]'}`}>
                                {candidate.profileCompletion ?? 0}%
                              </span>{' '}
                              • Status {candidate.profileStatus || 'Draft'}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <InterestBadge status={interestStatusFor(matchedCandidates.find((c) => c.id === candidate.id))} />
                            <button
                              disabled={busy || !perms.manageMatches || !matchCustomerId}
                              title={!matchCustomerId ? 'Select a customer first' : !perms.manageMatches ? 'Your role cannot assign matches' : 'Recommend this profile'}
                              onClick={() => {
                                const note = window.prompt('Assignment note (optional):');
                                if (note === null) return;
                                act(
                                  () =>
                                    fetch(`${API}/admin/match-assignment`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json', ...authHeaders() },
                                      body: JSON.stringify({ customerId: matchCustomerId, candidateId: candidate.id, note }),
                                    }),
                                  'Match recommended & customer notified'
                                );
                              }}
                              className="rounded-full bg-[#7b102d] px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Assign / Recommend
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {!perms.manageMatches && (
                    <div className="inline-flex items-center gap-1 rounded-xl bg-[#f4e9ee] px-3 py-2 text-xs font-bold uppercase text-[#8a5a6b]">
                      <Lock size={12} /> Your role can browse matches but cannot assign them
                    </div>
                  )}
                </div>
              </div>

              {/* Quick assign form */}
              <div className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
                <h2 className="mb-4 text-xl font-black">Quick assign</h2>
                <div className="space-y-3">
                  <label className="block text-sm font-semibold">Customer</label>
                  <select
                    value={assignForm.customerId}
                    onChange={(e) => setAssignForm((f) => ({ ...f, customerId: e.target.value }))}
                    className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2 text-sm"
                  >
                    <option value="">Select customer…</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>{customer.identifier}</option>
                    ))}
                  </select>

                  <label className="block text-sm font-semibold">Recommended candidate</label>
                  <select
                    value={assignForm.candidateId}
                    onChange={(e) => setAssignForm((f) => ({ ...f, candidateId: e.target.value }))}
                    className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2 text-sm"
                  >
                    <option value="">Select candidate…</option>
                    {candidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name} — {candidate.age}, {candidate.city} ({candidate.profession}){candidate.verifiedBadge ? ' ✔' : ''}
                      </option>
                    ))}
                  </select>

                  <label className="block text-sm font-semibold">Internal note</label>
                  <textarea
                    value={assignForm.note}
                    onChange={(e) => setAssignForm((f) => ({ ...f, note: e.target.value }))}
                    rows={3}
                    placeholder="Why this match fits the customer's preferences…"
                    className="w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2 text-sm"
                  />

                  <button
                    disabled={busy || !perms.manageMatches || !assignForm.customerId || !assignForm.candidateId}
                    onClick={() =>
                      act(
                        () =>
                          fetch(`${API}/admin/match-assignment`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...authHeaders() },
                            body: JSON.stringify(assignForm),
                          }),
                        'Match assigned & customer notified'
                      )
                    }
                    className="w-full rounded-full bg-[#7b102d] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  >
                    Assign recommended profile
                  </button>
                  {!perms.manageMatches && (
                    <p className="inline-flex items-center gap-1 text-xs font-bold uppercase text-[#8a5a6b]"><Lock size={11} /> Requires Relationship Manager or Admin role</p>
                  )}
                </div>
              </div>
            </div>

            {/* Assignment history + interest tracking */}
            <div className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
              <h2 className="mb-4 text-xl font-black">Assignment history &amp; interest tracking</h2>
              <div className="overflow-hidden rounded-2xl border border-[#f2d9a8]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#fff8ee] text-[#5f3d49]">
                    <tr>
                      <th className="px-4 py-3 font-bold">Customer</th>
                      <th className="px-4 py-3 font-bold">Assigned candidate</th>
                      <th className="px-4 py-3 font-bold">Note</th>
                      <th className="px-4 py-3 font-bold">Interest status</th>
                      <th className="px-4 py-3 font-bold">Assigned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.length === 0 ? (
                      <tr className="border-t border-[#f2d9a8] bg-white">
                        <td colSpan={5} className="px-4 py-4 text-center text-[#5a3743]">No matches assigned yet.</td>
                      </tr>
                    ) : (
                      assignments.slice(0, 20).map((assignment) => (
                        <tr key={assignment.id} className="border-t border-[#f2d9a8] bg-white">
                          <td className="px-4 py-3 font-semibold">
                            <Link href={`/admin/customers/${assignment.customerId}`} className="hover:underline">{assignment.customerName || `${assignment.customerId.slice(0, 8)}…`}</Link>
                          </td>
                          <td className="px-4 py-3 font-semibold">
                            <Link href={`/admin/customers/${assignment.candidateId}`} className="hover:underline">{assignment.candidateName || `${assignment.candidateId.slice(0, 8)}…`}</Link>
                          </td>
                          <td className="max-w-[220px] truncate px-4 py-3 text-xs text-[#6a4a57]" title={assignment.note || ''}>{assignment.note || '—'}</td>
                          <td className="px-4 py-3"><InterestBadge status={assignment.interestStatus} /></td>
                          <td className="px-4 py-3 text-xs">{new Date(assignment.assignedAt).toLocaleDateString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- Reports & Analytics (§28) ---------------- */}
        {tab === 'analytics' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black">Reports &amp; Analytics</h2>
              {perms.exportAnalytics && (
                <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-full bg-[#7b102d] px-4 py-2 text-sm font-bold text-white hover:opacity-90">
                  <Download size={15} /> CSV Export
                </button>
              )}
            </div>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[
                { label: 'Total Revenue (Approved)', value: rupees(analytics?.revenue.total ?? 0), sub: `${analytics?.revenue.approvedPaymentsCount ?? 0} approved payment(s)` },
                { label: 'Consultation Revenue', value: rupees(analytics?.revenue.consultation ?? 0), sub: 'Paid consultation sessions' },
                { label: 'Membership Revenue', value: rupees(analytics?.revenue.memberships ?? 0), sub: `Gold ${rupees(analytics?.revenue.gold ?? 0)} • Premium ${rupees(analytics?.revenue.premium ?? 0)}` },
                { label: 'Active Plans', value: String(analytics?.activePlans.total ?? 0), sub: `Consultation ${analytics?.activePlans.consultation ?? 0} • Gold ${analytics?.activePlans.gold ?? 0} • Premium ${analytics?.activePlans.premium ?? 0}` },
                { label: 'Appointments', value: String(analytics?.appointments.total ?? 0), sub: `Booked ${analytics?.appointments.booked ?? 0} • Completed ${analytics?.appointments.completed ?? 0} • Cancelled ${analytics?.appointments.cancelled ?? 0}` },
                { label: 'Upcoming Appointments', value: String(analytics?.appointments.upcoming ?? 0), sub: `Across ${analytics?.customers.total ?? 0} customer(s)` },
              ].map((card) => (
                <div key={card.label} className="rounded-[24px] border border-[#f2d8a8] bg-white p-5 shadow-soft">
                  <div className="text-sm text-[#5a3743]">{card.label}</div>
                  <div className="mt-3 truncate text-3xl font-black" title={card.value}>{card.value}</div>
                  <div className="mt-1 truncate text-xs text-[#6a4a57]" title={card.sub}>{card.sub}</div>
                </div>
              ))}
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              {[
                { label: 'Approved Payments', count: analytics?.paymentsByStatus.approved ?? 0, cls: 'bg-[#eaf8ef] text-[#0a7d4c]' },
                { label: 'Pending Verification', count: analytics?.paymentsByStatus.pending ?? 0, cls: 'bg-[#fff0cf] text-[#8a5a11]' },
                { label: 'Rejected Payments', count: analytics?.paymentsByStatus.rejected ?? 0, cls: 'bg-[#ffe5e5] text-[#9b1f2f]' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-[24px] border border-[#f2d8a8] bg-white p-5 shadow-soft">
                  <span className="text-sm text-[#5a3743]">{item.label}</span>
                  <span className={`rounded-full px-3 py-1 text-sm font-black uppercase ${item.cls}`}>{item.count}</span>
                </div>
              ))}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

// §31 — internal notes thread (staff-only, never exposed to customers)
function NotesPanel({ targetType, targetId }: { targetType: string; targetId: string }) {
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadNotes = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin/notes?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`, { headers: authHeaders() });
      if (!res.ok) return;
      const json = await res.json();
      setNotes(json.notes || []);
    } catch {
      /* keep previous */
    }
  }, [targetType, targetId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  async function addNote() {
    if (!draft.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API}/admin/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ targetType, targetId, note: draft }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not save note');
      setDraft('');
      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save note');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-dashed border-[#d4a64a] bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#7b102d]">
        <StickyNote size={13} /> Internal notes <span className="font-medium normal-case text-[#6a4a57]">(never visible to customers)</span>
      </div>
      <ul className="space-y-2">
        {notes.length === 0 ? (
          <li className="rounded-xl bg-[#fffaf3] p-3 text-sm text-[#5a3743]">No internal notes yet.</li>
        ) : (
          notes.map((note) => (
            <li key={note.id} className="rounded-xl bg-[#fffaf3] p-3 text-sm text-[#5a3743]">
              <span className="font-semibold text-[#2c0d16]">{note.authorIdentifier || 'Staff'}</span> · {new Date(note.createdAt).toLocaleString()}
              <div className="mt-1 whitespace-pre-wrap">{note.note}</div>
            </li>
          ))
        )}
      </ul>
      {error && <div className="mt-2 text-xs font-semibold text-[#9b1f2f]">{error}</div>}
      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void addNote();
            }
          }}
          placeholder="Add an internal note…"
          className="flex-1 rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2 text-sm"
        />
        <button onClick={addNote} disabled={saving || !draft.trim()} className="rounded-full bg-[#7b102d] px-4 py-2 text-xs font-bold text-white disabled:opacity-60">
          {saving ? 'Saving…' : 'Add note'}
        </button>
      </div>
    </div>
  );
}
