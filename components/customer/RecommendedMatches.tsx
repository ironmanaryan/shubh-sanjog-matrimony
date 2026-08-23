'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CameraOff, CheckCircle2, Clock3, Heart, Search, ShieldCheck, XCircle } from 'lucide-react';
import { compatibilityBadgeClass } from '@/lib/compatibility';

type MatchProfile = {
  id: string;
  name: string;
  gender?: string;
  age: number | null;
  city: string;
  state?: string;
  religion: string;
  caste: string;
  height: string;
  education: string;
  profession: string;
  matchScore: number;
  photoVisible: boolean;
  phoneVisible: boolean;
  phone: string;
  interestStatus: string | null;
  profileCompletion?: number;
  verifiedBadge?: boolean;
  matchReasons?: string;
};

type InterestRequest = {
  id: string;
  fromUserId: string;
  toProfileId: string;
  name: string;
  status: 'Pending' | 'Accepted' | 'Rejected' | string;
  direction: 'sent' | 'received';
  createdAt: number;
};

const RELIGIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Jain', 'Buddhist', 'Other'];

const HEIGHT_OPTIONS = [
  { label: 'Any', value: '' },
  { label: '4ft 6in', value: '4.5' },
  { label: '4ft 9in', value: '4.75' },
  { label: '5ft', value: '5' },
  { label: '5ft 3in', value: '5.25' },
  { label: '5ft 6in', value: '5.5' },
  { label: '5ft 9in', value: '5.75' },
  { label: '6ft', value: '6' },
];

type Filters = {
  minAge: string;
  maxAge: string;
  minHeightFt: string;
  maxHeightFt: string;
  religion: string;
  caste: string;
  education: string;
  location: string;
};

const EMPTY_FILTERS: Filters = { minAge: '21', maxAge: '40', minHeightFt: '', maxHeightFt: '', religion: '', caste: '', education: '', location: '' };

function statusBadge(status?: string | null) {
  switch (status) {
    case 'Accepted':
      return <span className="inline-flex items-center gap-1 rounded-full bg-[#eaf8ef] px-2 py-1 text-[10px] font-bold uppercase text-[#0a7d4c]"><CheckCircle2 size={11} /> Accepted</span>;
    case 'Rejected':
      return <span className="inline-flex items-center gap-1 rounded-full bg-[#ffe5e5] px-2 py-1 text-[10px] font-bold uppercase text-[#9b1f2f]"><XCircle size={11} /> Rejected</span>;
    case 'Pending':
      return <span className="inline-flex items-center gap-1 rounded-full bg-[#fff0cf] px-2 py-1 text-[10px] font-bold uppercase text-[#8a5a11]"><Clock3 size={11} /> Pending</span>;
    default:
      return null;
  }
}

export default function RecommendedMatches({ initial }: { initial?: MatchProfile[] }) {
  // Profiles come strictly from /api/matches/search (privacy-filtered server-side)
  const [profiles, setProfiles] = useState<MatchProfile[]>(initial || []);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searching, setSearching] = useState(false);
  const [interests, setInterests] = useState<InterestRequest[]>([]);
  const [shortlist, setShortlist] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState('');
  const [hasToken, setHasToken] = useState(false);

  const API = (process.env.NEXT_PUBLIC_API_URL as string) || 'http://localhost:4000/api';

  useEffect(() => {
    setHasToken(Boolean(localStorage.getItem('token')));
  }, []);

  const buildQuery = useCallback((f: Filters) => {
    const params = new URLSearchParams();
    if (f.minAge) params.set('minAge', f.minAge);
    if (f.maxAge) params.set('maxAge', f.maxAge);
    if (f.minHeightFt) params.set('minHeightFt', f.minHeightFt);
    if (f.maxHeightFt) params.set('maxHeightFt', f.maxHeightFt);
    if (f.religion) params.set('religion', f.religion);
    if (f.caste) params.set('caste', f.caste);
    if (f.education) params.set('education', f.education);
    if (f.location) params.set('location', f.location);
    return params.toString();
  }, []);

  // Initial load: shortlist + existing interest statuses via a default search
  useEffect(() => {
    async function load() {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) return;

      try {
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
        const [slRes, intRes] = await Promise.all([
          fetch(`${API}/matches/shortlist`, { headers }),
          fetch(`${API}/matches/interests`, { headers }),
        ]);

        if (slRes.ok) {
          const sjson = await slRes.json();
          const setObj: Record<string, boolean> = {};
          (sjson.shortlisted || []).forEach((id: string) => (setObj[id] = true));
          setShortlist(setObj);
        }
        if (intRes.ok) {
          const ijson = await intRes.json();
          setInterests([...(ijson.sent || []), ...(ijson.received || [])]);
        }
      } catch (err) {
        console.error('load matches context', err);
      }
    }
    load();
  }, [API]);

  const runSearch = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setProfiles([]); // matches require a JWT — no mock fallback
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`${API}/matches/search?${buildQuery(filters)}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Search failed');
      const json = await res.json();
      setProfiles(json.profiles || []);
    } catch (err) {
      console.error('search profiles', err);
      setNotice('Could not run the search. Please try again.');
    } finally {
      setSearching(false);
    }
  }, [API, buildQuery, filters]);

  const interestByProfile = useMemo(() => {
    const map: Record<string, InterestRequest> = {};
    interests.forEach((r) => {
      if (r.direction === 'sent') map[r.toProfileId] = r;
    });
    return map;
  }, [interests]);

  async function toggleShortlist(profileId: string) {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setShortlist((s) => ({ ...s, [profileId]: !s[profileId] }));
        return;
      }
      const res = await fetch(`${API}/matches/shortlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ profileId }),
      });
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      const ids: string[] = json.shortlisted || [];
      const next: Record<string, boolean> = {};
      ids.forEach((id) => (next[id] = true));
      setShortlist(next);
    } catch (err) {
      console.error('shortlist err', err);
      alert('Failed to update shortlist');
    }
  }

  async function expressInterest(profileId: string) {
    const token = localStorage.getItem('token');
    if (!token) {
      setNotice('Please log in to express interest.');
      return;
    }
    try {
      const res = await fetch(`${API}/matches/interest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ profileId }),
      });
      const json = await res.json();
      if (!res.ok && !json.request) throw new Error(json.error || 'Failed');

      const request = json.request as InterestRequest | undefined;
      if (request) {
        setInterests((current) => [{ ...request, direction: 'sent', name: '' }, ...current.filter((r) => !(r.direction === 'sent' && r.toProfileId === profileId))]);
        setProfiles((current) => current.map((p) => (p.id === profileId ? { ...p, interestStatus: request.status } : p)));
      }
      setNotice(json.alreadySent ? 'You have already expressed interest in this profile.' : 'Interest sent! You will be notified once they respond.');
    } catch (err) {
      console.error('interest err', err);
      alert('Failed to send interest');
    }
  }

  async function respondToInterest(requestId: string, action: 'accept' | 'reject') {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${API}/matches/interest/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      const updated = json.request as InterestRequest;
      setInterests((current) => current.map((r) => (r.id === requestId ? { ...r, status: updated.status } : r)));
      setNotice(action === 'accept' ? 'Interest accepted — your contact details are now visible to them.' : 'Interest rejected.');
    } catch (err) {
      console.error('respond interest err', err);
      alert('Could not update the interest request');
    }
  }

  const receivedRequests = interests.filter((r) => r.direction === 'received');
  const sentRequests = interests.filter((r) => r.direction === 'sent');

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Advanced partner-search filters */}
      <div className="rounded-2xl border border-[#f2d9a8] bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-[#7b102d]">
          <Search size={15} /> Partner search
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-[#5a3743]">Age range</label>
            <div className="flex items-center gap-2">
              <input type="number" min={18} placeholder="Min" value={filters.minAge} onChange={(e) => setFilters((s) => ({ ...s, minAge: e.target.value }))} className="w-full rounded-xl border border-[#f2d9a8] px-3 py-2 text-sm" />
              <span className="text-xs text-[#6a4a57]">to</span>
              <input type="number" min={18} placeholder="Max" value={filters.maxAge} onChange={(e) => setFilters((s) => ({ ...s, maxAge: e.target.value }))} className="w-full rounded-xl border border-[#f2d9a8] px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[#5a3743]">Height range</label>
            <div className="flex items-center gap-2">
              <select value={filters.minHeightFt} onChange={(e) => setFilters((s) => ({ ...s, minHeightFt: e.target.value }))} className="w-full rounded-xl border border-[#f2d9a8] px-2 py-2 text-sm">
                {HEIGHT_OPTIONS.map((o) => (<option key={`min-${o.label}`} value={o.value}>Min {o.label}</option>))}
              </select>
              <select value={filters.maxHeightFt} onChange={(e) => setFilters((s) => ({ ...s, maxHeightFt: e.target.value }))} className="w-full rounded-xl border border-[#f2d9a8] px-2 py-2 text-sm">
                {HEIGHT_OPTIONS.map((o) => (<option key={`max-${o.label}`} value={o.value}>Max {o.label}</option>))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[#5a3743]">Religion</label>
            <select value={filters.religion} onChange={(e) => setFilters((s) => ({ ...s, religion: e.target.value }))} className="w-full rounded-xl border border-[#f2d9a8] px-3 py-2 text-sm">
              <option value="">Any religion</option>
              {RELIGIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[#5a3743]">Caste / Community</label>
            <input placeholder="e.g., Brahmin" value={filters.caste} onChange={(e) => setFilters((s) => ({ ...s, caste: e.target.value }))} className="w-full rounded-xl border border-[#f2d9a8] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[#5a3743]">Education / Profession</label>
            <input placeholder="e.g., Engineer, MBA" value={filters.education} onChange={(e) => setFilters((s) => ({ ...s, education: e.target.value }))} className="w-full rounded-xl border border-[#f2d9a8] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[#5a3743]">Location</label>
            <input placeholder="City or state" value={filters.location} onChange={(e) => setFilters((s) => ({ ...s, location: e.target.value }))} className="w-full rounded-xl border border-[#f2d9a8] px-3 py-2 text-sm" />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:justify-end">
            <button onClick={() => { setFilters(EMPTY_FILTERS); setProfiles([]); }} className="rounded-xl border border-[#f2d9a8] px-3 py-2 text-sm font-semibold">Reset</button>
            {!hasToken ? null : (
              <button onClick={runSearch} disabled={searching} className="rounded-xl bg-[#7b102d] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                {searching ? 'Searching…' : 'Apply filters'}
              </button>
            )}
            <div className="self-center text-sm text-[#6a4a57]">{profiles.length} matches</div>
          </div>
        </div>
      </div>

      {notice && <div className="rounded-2xl border border-[#f2d9a8] bg-[#fffaf3] p-3 text-sm text-[#5a3743]">{notice}</div>}

      {/* Received interest requests — accept / reject */}
      {receivedRequests.length > 0 && (
        <div className="rounded-2xl border border-[#f2d9a8] bg-white p-4 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-[0.16em] text-[#7b102d]">Interest requests received</h3>
          <ul className="mt-3 space-y-2">
            {receivedRequests.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 rounded-xl bg-[#fffaf3] p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="font-semibold text-[#2c0d16]">{r.name || r.fromUserId.slice(0, 8)} wants to connect</span>
                <span className="flex items-center gap-2">
                  {statusBadge(r.status)}
                  {r.status === 'Pending' ? (
                    <>
                      <button onClick={() => respondToInterest(r.id, 'accept')} className="rounded-full bg-[#0a7d4c] px-3 py-1.5 text-xs font-bold text-white">Accept</button>
                      <button onClick={() => respondToInterest(r.id, 'reject')} className="rounded-full border border-[#e5c88d] px-3 py-1.5 text-xs font-bold text-[#9b1f2f]">Reject</button>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Results grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {profiles.map((p) => {
          const interestStatus = p.interestStatus || interestByProfile[p.id]?.status || null;
          return (
            <div key={p.id} className="overflow-hidden rounded-2xl border border-[#f2d9a8] bg-[#fffaf3]">
              <MatchPhoto profileId={p.id} name={p.name} photoDocId={(p as MatchProfile & { photoDocId?: string | null }).photoDocId || null} visible={p.photoVisible} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-lg font-black text-[#2c0d16]">
                      {p.name}
                      {/* §30/§31: Verified Profile badge for admin-approved profiles */}
                      {p.verifiedBadge ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#eaf8ef] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0a7d4c]">
                          <ShieldCheck size={11} /> Verified Profile
                        </span>
                      ) : null}
                    </div>
                    <div className="text-sm text-[#6a4a57]">{p.age ? `${p.age} yrs` : '—'} • {p.height || '—'} • {p.city || '—'}</div>
                    <div className="mt-1 text-xs text-[#6a4a57]">{[p.religion, p.caste].filter(Boolean).join(' • ') || 'Religion not specified'}</div>
                    <div className="mt-0.5 text-xs text-[#6a4a57]">{[p.education, p.profession].filter(Boolean).join(' • ') || '—'}</div>
                    <div className="mt-1 text-xs text-[#6a4a57]">
                      {p.phoneVisible ? (p.phone ? `📞 ${p.phone}` : '') : <span className="inline-flex items-center gap-1 text-[#8a5a11]">📞 hidden until interest accepted</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-xs font-black ${compatibilityBadgeClass(Number(p.matchScore || 0))}`}
                      title={p.matchReasons || `Scored against your partner preferences`}
                    >
                      {Number(p.matchScore || 0)}% Match
                    </span>
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-[#6a4a57]">compatibility</div>
                    {typeof p.profileCompletion === 'number' && p.profileCompletion > 0 ? (
                      <div className="mt-1 text-[10px] uppercase tracking-wide text-[#6a4a57]">{p.profileCompletion}% complete</div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button onClick={() => toggleShortlist(p.id)} className={`rounded-full px-3 py-2 text-sm font-semibold ${shortlist[p.id] ? 'bg-[#d4a64a] text-white' : 'border border-[#f2d9a8] bg-white'}`}>
                    {shortlist[p.id] ? 'Shortlisted' : 'Shortlist'}
                  </button>
                  {interestStatus === 'Accepted' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#0a7d4c] px-3 py-2 text-sm font-semibold text-white"><CheckCircle2 size={14} /> Accepted</span>
                  ) : interestStatus === 'Pending' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#fff0cf] px-3 py-2 text-sm font-semibold text-[#8a5a11]"><Clock3 size={14} /> Pending</span>
                  ) : interestStatus === 'Rejected' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#ffe5e5] px-3 py-2 text-sm font-semibold text-[#9b1f2f]"><XCircle size={14} /> Rejected</span>
                  ) : (
                    <button onClick={() => expressInterest(p.id)} className="inline-flex items-center gap-1 rounded-full bg-[#7b102d] px-3 py-2 text-sm font-semibold text-white"><Heart size={14} /> Express Interest</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {sentRequests.length > 0 && (
        <div className="rounded-2xl border border-[#f2d9a8] bg-white p-4 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-[0.16em] text-[#7b102d]">My sent interests</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {sentRequests.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-xl bg-[#fffaf3] p-3 text-sm">
                <span className="font-semibold text-[#2c0d16]">{r.name || r.toProfileId.slice(0, 8)}</span>
                {statusBadge(r.status)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ProfilePhoto({ name, visible }: { name: string; visible: boolean }) {
  if (!visible) {
    return (
      <div className="flex h-44 w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#f6e8d8] to-[#efd9bd] text-[#7b102d]">
        <CameraOff size={22} />
        <span className="text-xs font-bold uppercase tracking-[0.14em]">Photo hidden</span>
      </div>
    );
  }

  const initials = name.split(' ').map((part) => part.charAt(0)).slice(0, 2).join('').toUpperCase();
  return (
    <div className="flex h-44 w-full items-center justify-center bg-gradient-to-br from-[#7b102d] to-[#d4a64a] text-4xl font-black text-white">
      {initials}
    </div>
  );
}

// Renders the customer's uploaded photograph through the authenticated document
// endpoint (JWT + privacy rules). Falls back to initials when no photo exists.
function MatchPhoto({ profileId, name, photoDocId, visible }: { profileId: string; name: string; photoDocId: string | null; visible: boolean }) {
  const API = (process.env.NEXT_PUBLIC_API_URL as string) || 'http://localhost:4000/api';
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !photoDocId) return;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await fetch(`${API}/documents/${photoDocId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setPhotoUrl(objectUrl);
      } catch {
        /* keep initials fallback */
      }
    })();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, photoDocId, visible]);

  if (!visible) {
    return (
      <div className="flex h-44 w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#f6e8d8] to-[#efd9bd] text-[#7b102d]">
        <CameraOff size={22} />
        <span className="text-xs font-bold uppercase tracking-[0.14em]">Photo hidden until approval or accepted interest</span>
      </div>
    );
  }

  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={`${name}'s photograph`} className="h-44 w-full object-cover" />;
  }

  return <ProfilePhoto name={name} visible />;
}
