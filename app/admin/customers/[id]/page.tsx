'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  BriefcaseBusiness,
  FileText,
  GraduationCap,
  Heart,
  Home,
  Lock,
  ShieldCheck,
  StickyNote,
  Users,
} from 'lucide-react';
import AdminSignInGate from '@/components/admin/AdminSignInGate';
import { clearSession, getSession, isNetworkError } from '@/lib/auth-client';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

type Permissions = { addNotes: boolean } & Record<string, boolean>;

// Full-permission fallback for cached/offline admin sessions where /admin/me
// could not be reached (mirrors the main admin panel's resilience ladder).
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

type CustomerDetail = {
  id: string;
  identifier: string;
  role?: string;
  createdAt?: number | null;
};

type FamilyInfo = {
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

type ProfileDetail = {
  personal?: Record<string, unknown>;
  education?: Record<string, unknown>;
  family?: FamilyInfo;
  preferences?: Record<string, unknown>;
  status?: string;
  reviewNote?: string | null;
  profileCompletion?: number;
};

type AssignmentRow = { id: string; candidateId: string; note?: string; assignedAt: number };

type InternalNote = { id: string; note: string; createdAt: number; authorIdentifier?: string };

type DetailResponse = {
  customer?: CustomerDetail;
  profile?: ProfileDetail | null;
  assignments?: AssignmentRow[];
};

type TabKey = 'overview' | 'notes';

function str(value: unknown): string {
  return value === undefined || value === null || String(value).trim() === '' ? '' : String(value);
}

function DetailRow({ label, value }: { label: string; value: unknown }) {
  const text = str(value);
  return (
    <div className="rounded-xl bg-white px-3 py-2.5 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a6a75]">{label}</div>
      <div className="mt-0.5 break-words text-sm font-bold text-[#2c0d16]" title={text || undefined}>{text || '—'}</div>
    </div>
  );
}

export default function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [authState, setAuthState] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [permissions, setPermissions] = useState<Permissions>(FULL_PERMISSIONS);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<TabKey>('overview');

  // Bootstrap the staff session (same ladder as the main panel): token +
  // /admin/me first, cached admin identity as an offline fallback.
  useEffect(() => {
    const { token, user } = getSession();
    const cachedIsAdmin =
      user?.role === 'admin' ||
      Boolean(user?.identifier && user.identifier.toLowerCase().includes('admin'));

    if (!token) {
      setAuthState('denied');
      return;
    }

    let settled = false;
    fetch(`${API}/admin/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        settled = true;
        if (!res.ok) {
          if (cachedIsAdmin) setAuthState('allowed');
          else {
            clearSession();
            setAuthState('denied');
          }
          return;
        }
        const json = await res.json().catch(() => ({}));
        setPermissions(json?.me?.permissions ? { ...FULL_PERMISSIONS, ...json.me.permissions } : FULL_PERMISSIONS);
        setAuthState('allowed');
      })
      .catch((err) => {
        settled = true;
        if (cachedIsAdmin && isNetworkError(err)) setAuthState('allowed');
        else setAuthState('denied');
      });

    const timeout = setTimeout(() => {
      if (!settled && cachedIsAdmin) setAuthState('allowed');
    }, 8000);
    return () => clearTimeout(timeout);
  }, []);

  const loadCustomer = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoadError('Please sign in as admin to view this customer.');
        return;
      }
      // Fallback try-catch so a network failure never crashes the page.
      const res = await fetch(`${API}/admin/customers/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not load this customer');
      setDetail(json);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load this customer');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (authState === 'allowed') void loadCustomer();
  }, [authState, loadCustomer]);

  if (authState === 'checking') {
    return <div className="min-h-screen bg-[#fffaf8] px-4 py-12 text-[#2c0d16]">Loading customer workspace…</div>;
  }

  if (authState === 'denied') {
    return <AdminSignInGate />;
  }

  const name =
    str(detail?.profile?.personal?.firstName) || str(detail?.profile?.personal?.lastName)
      ? `${str(detail?.profile?.personal?.firstName)} ${str(detail?.profile?.personal?.lastName)}`.trim()
      : detail?.customer?.identifier || id;
  const verified = detail?.profile?.status === 'Approved';
  const completion = Math.max(0, Math.min(100, Number(detail?.profile?.profileCompletion ?? 0)));

  const familyRows: Array<{ label: string; value: unknown }> = [
    { label: "Father's name", value: detail?.profile?.family?.fatherName },
    { label: "Father's occupation", value: detail?.profile?.family?.fatherOccupation },
    { label: "Mother's name", value: detail?.profile?.family?.motherName },
    { label: "Mother's occupation", value: detail?.profile?.family?.motherOccupation },
    {
      label: 'Siblings',
      value:
        detail?.profile?.family?.numberOfBrothers !== undefined || detail?.profile?.family?.numberOfSisters !== undefined
          ? `${Number(detail?.profile?.family?.numberOfBrothers) || 0} brother(s) • ${Number(detail?.profile?.family?.numberOfSisters) || 0} sister(s)`
          : '',
    },
    { label: 'Family type', value: detail?.profile?.family?.familyType },
    { label: 'Family status', value: detail?.profile?.family?.familyStatus },
    { label: 'Family location', value: detail?.profile?.family?.familyLocation },
    { label: 'Other family info', value: detail?.profile?.family?.otherInfo },
  ];

  return (
    <div className="min-h-screen bg-[#fffaf8] px-4 py-6 text-[#2c0d16] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 rounded-[28px] border border-[#f1d7a6] bg-white p-5 shadow-soft">
          <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#7b102d] hover:underline">
            <ArrowLeft size={15} /> Back to admin panel
          </Link>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#7b102d]">Customer workspace</p>
              <h1 className="mt-2 flex flex-wrap items-center gap-3 text-3xl font-black tracking-[-0.04em]">
                {name}
                {verified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#eaf8ef] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#0a7d4c]">
                    <ShieldCheck size={13} /> Verified Profile
                  </span>
                ) : null}
              </h1>
              <p className="mt-1 text-sm text-[#6a4a57]">
                {detail?.customer?.identifier || '—'} · Status: {detail?.profile?.status || 'Draft'}
              </p>
            </div>

            <div
              className="flex h-20 w-20 flex-col items-center justify-center rounded-full border-4 border-[#efe2d2]"
              style={{ borderTopColor: completion >= 70 ? '#0a7d4c' : '#d4a64a', borderRightColor: completion >= 70 ? '#0a7d4c' : '#d4a64a' }}
              role="img"
              aria-label={`Profile ${completion}% complete`}
              title={`Profile ${completion}% complete`}
            >
              <span className="text-xl font-black leading-none">{completion}%</span>
              <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#6a4a57]">complete</span>
            </div>
          </div>

          {/* Tabs */}
          <nav className="mt-5 flex flex-wrap gap-2" aria-label="Customer workspace tabs">
            {([
              { key: 'overview' as TabKey, label: 'Profile & Family Details', icon: Users },
              { key: 'notes' as TabKey, label: 'Internal Notes', icon: StickyNote },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-current={tab === key ? 'page' : undefined}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${
                  tab === key ? 'bg-[#7b102d] text-white shadow-lg shadow-[#7b102d]/20' : 'border border-[#e9d4a3] bg-white text-[#4d2c36] hover:bg-[#fff7ee]'
                }`}
              >
                <Icon size={15} />
                {label}
                {key === 'notes' && !permissions.addNotes ? <Lock size={11} /> : null}
              </button>
            ))}
          </nav>
        </div>

        {loadError && (
          <div className="mb-5 rounded-2xl border border-[#f3cccc] bg-[#fdf1f1] p-3 text-sm font-medium text-[#9b1f2f]">{loadError}</div>
        )}

        {loading ? (
          <div className="rounded-[28px] border border-[#f2d9a8] bg-white p-6 text-sm text-[#5a3743] shadow-soft">Loading customer details…</div>
        ) : !detail?.profile ? (
          <div className="rounded-[28px] border border-dashed border-[#f2d9a8] bg-white p-8 text-center text-sm text-[#5a3743] shadow-soft">
            This customer has not created a biodata profile yet.
          </div>
        ) : tab === 'overview' ? (
          <div className="space-y-6">
            {/* Personal */}
            <section className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-black"><Home size={17} className="text-[#7b102d]" /> Personal details</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <DetailRow label="Full name" value={`${str(detail.profile.personal?.firstName)} ${str(detail.profile.personal?.lastName)}`.trim()} />
                <DetailRow label="Gender" value={detail.profile.personal?.gender} />
                <DetailRow label="Date of birth" value={detail.profile.personal?.dob} />
                <DetailRow label="Height" value={detail.profile.personal?.height} />
                <DetailRow label="Religion" value={detail.profile.personal?.religion} />
                <DetailRow label="Caste / Community" value={detail.profile.personal?.caste} />
                <DetailRow label="Mother tongue" value={detail.profile.personal?.motherTongue} />
                <DetailRow label="Marital status" value={detail.profile.personal?.maritalStatus} />
                <DetailRow label="City" value={detail.profile.personal?.city} />
                <DetailRow label="State" value={detail.profile.personal?.state} />
                <DetailRow label="Manglik status" value={detail.profile.personal?.manglikStatus} />
              </div>
            </section>

            {/* Education & career */}
            <section className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-black"><GraduationCap size={17} className="text-[#7b102d]" /> Education &amp; career</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <DetailRow label="Highest qualification" value={detail.profile.education?.highestQualification} />
                <DetailRow label="Profession" value={detail.profile.education?.profession} />
                <DetailRow label="Company" value={detail.profile.education?.company} />
                <DetailRow label="Annual income" value={detail.profile.education?.annualIncome} />
                <DetailRow label="Work location" value={detail.profile.education?.workLocation} />
              </div>
            </section>

            {/* Family structure */}
            <section className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-black"><Users size={17} className="text-[#7b102d]" /> Family structure</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {familyRows.map((row) => (
                  <DetailRow key={row.label} label={row.label} value={row.value} />
                ))}
              </div>
            </section>

            {/* Partner preferences */}
            <section className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-black"><Heart size={17} className="text-[#7b102d]" /> Partner preferences</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <DetailRow label="Preferred gender" value={detail.profile.preferences?.preferredGender} />
                <DetailRow label="Age range" value={[detail.profile.preferences?.minAge, detail.profile.preferences?.maxAge].filter((v) => str(v)).join(' – ')} />
                <DetailRow label="Religion" value={detail.profile.preferences?.religion} />
                <DetailRow label="Caste" value={detail.profile.preferences?.caste} />
                <DetailRow label="Location" value={detail.profile.preferences?.location} />
              </div>
            </section>

            {(detail.assignments || []).length > 0 && (
              <section className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-black"><BriefcaseBusiness size={17} className="text-[#7b102d]" /> Assigned matches</h2>
                <ul className="space-y-2 text-sm text-[#5a3743]">
                  {detail.assignments!.slice(0, 10).map((assignment) => (
                    <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#fffaf3] p-3">
                      <span className="font-mono text-xs">{assignment.candidateId.slice(0, 8)}…</span>
                      <span className="max-w-md truncate" title={assignment.note || ''}>{assignment.note || 'No note'}</span>
                      <span className="text-xs">{new Date(assignment.assignedAt).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        ) : (
          /* Private admin-only notes */
          <InternalNotesSection customerId={id} canAdd={permissions.addNotes !== false} />
        )}
      </div>
    </div>
  );
}

// §31 — private notes thread bound to this customer (targetType: "customer").
// Stored in SQLite and only reachable by staff roles; never exposed to customers.
function InternalNotesSection({ customerId, canAdd }: { customerId: string; canAdd: boolean }) {
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadNotes = useCallback(async () => {
    setLoadingNotes(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch(
        `${API}/admin/notes?targetType=customer&targetId=${encodeURIComponent(customerId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok) setNotes(json.notes || []);
      else throw new Error(json.error || 'Could not load notes');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load notes');
    } finally {
      setLoadingNotes(false);
    }
  }, [customerId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  async function addNote() {
    if (!draft.trim()) return;
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Please sign in as admin to add notes.');
      const res = await fetch(`${API}/admin/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetType: 'customer', targetId: customerId, note: draft }),
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
    <section className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
      <div className="mb-1 flex items-center gap-2">
        <StickyNote size={18} className="text-[#7b102d]" />
        <h2 className="text-lg font-black">Internal notes</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#f4e9ee] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#8a5a6b]">
          <Lock size={11} /> Admin-only · never visible to customers
        </span>
      </div>
      <p className="mb-4 text-sm text-[#5a3743]">Private observations about this customer for the verification and matchmaking team.</p>

      {!canAdd && (
        <div className="mb-4 inline-flex items-center gap-1 rounded-xl bg-[#f4e9ee] px-3 py-2 text-xs font-bold uppercase text-[#8a5a6b]">
          <Lock size={12} /> Your role cannot add notes
        </div>
      )}

      {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-[#9b1f2f]">{error}</div>}

      <ul className="space-y-2">
        {loadingNotes ? (
          <li className="rounded-xl bg-[#fffaf3] p-3 text-sm text-[#5a3743]">Loading notes…</li>
        ) : notes.length === 0 ? (
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

      <div className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void addNote();
            }
          }}
          disabled={!canAdd}
          placeholder="Add a private internal note…"
          className="flex-1 rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-3 py-2 text-sm disabled:opacity-60"
        />
        <button
          onClick={addNote}
          disabled={saving || !draft.trim() || !canAdd}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#7b102d] px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
        >
          <FileText size={12} /> {saving ? 'Saving…' : 'Add note'}
        </button>
      </div>
    </section>
  );
}
