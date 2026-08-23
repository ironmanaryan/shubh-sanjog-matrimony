'use client';

import { useEffect, useState } from 'react';
import { EyeOff, Lock, ShieldCheck } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

type PrivacyState = { hidePhoto: boolean; hidePhone: boolean };

export default function PrivacySettings() {
  const [privacy, setPrivacy] = useState<PrivacyState>({ hidePhoto: false, hidePhone: false });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${API}/customer/privacy`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        if (json.privacy) {
          setPrivacy({ hidePhoto: json.privacy.hidePhoto === true, hidePhone: json.privacy.hidePhone === true });
        }
      })
      .catch((err) => console.error('load privacy', err));
  }, []);

  const toggle = async (key: keyof PrivacyState) => {
    const token = localStorage.getItem('token');
    if (!token) {
      setMessage('Please log in to update privacy settings.');
      return;
    }

    const next = { ...privacy, [key]: !privacy[key] };
    setPrivacy(next);
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`${API}/customer/privacy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(next),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save privacy settings');
      if (json.privacy) setPrivacy({ hidePhoto: json.privacy.hidePhoto === true, hidePhone: json.privacy.hidePhone === true });
      setMessage('Privacy settings saved.');
    } catch (err) {
      // revert on failure
      setPrivacy(privacy);
      setMessage(err instanceof Error ? err.message : 'Could not save privacy settings');
    } finally {
      setSaving(false);
    }
  };

  const toggles: Array<{ key: keyof PrivacyState; label: string; description: string; icon: typeof EyeOff }> = [
    { key: 'hidePhoto', label: 'Hide Profile Photo', description: 'Your photo stays hidden from other members until you accept their interest.', icon: EyeOff },
    { key: 'hidePhone', label: 'Hide Phone Number', description: 'Your phone number is masked until an interest between you and a member is accepted.', icon: Lock },
  ];

  return (
    <div className="rounded-[28px] border border-[#f2d9a8] bg-white p-5 shadow-soft">
      <h2 className="flex items-center gap-2 text-xl font-black text-[#2c0d16]"><ShieldCheck size={20} /> Privacy &amp; verification</h2>
      <p className="mt-2 text-sm text-[#5a3743]">Control what other members can see. Hidden details unlock automatically once you accept their interest.</p>

      <div className="mt-4 space-y-3">
        {toggles.map(({ key, label, description, icon: Icon }) => (
          <div key={key} className="flex items-start justify-between gap-4 rounded-2xl bg-[#fffaf3] p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f9f0d0] text-[#7b102d]">
                <Icon size={16} />
              </span>
              <div>
                <div className="text-sm font-bold text-[#2c0d16]">{label}</div>
                <div className="mt-0.5 text-xs text-[#6a4a57]">{description}</div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={privacy[key]}
              aria-label={label}
              disabled={saving}
              onClick={() => toggle(key)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${privacy[key] ? 'bg-[#7b102d]' : 'bg-[#e2d3c3]'} disabled:opacity-60`}
            >
              <span className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition ${privacy[key] ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
            </button>
          </div>
        ))}
      </div>

      {message && <div className="mt-3 rounded-2xl bg-[#fff8ee] p-3 text-sm text-[#5a3743]">{message}</div>}
    </div>
  );
}
