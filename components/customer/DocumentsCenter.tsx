'use client'

import React, { useState, useRef, useEffect } from 'react';

type DocItem = { id: string; name: string; uploadedAt: number; status: 'Pending' | 'Approved' | 'Rejected'; documentType?: string | null };

const docTypeLabels: Record<string, string> = {
  identity: 'Identity Proof',
  address: 'Address Proof',
  education: 'Educational Certificate',
  income: 'Professional / Income Proof',
  photograph: 'Photograph',
  kundli: 'Kundli / Horoscope',
  other: 'Other',
};

function normalizeDocStatus(status?: string | null) {
  const raw = String(status || 'Pending').trim();
  const lower = raw.toLowerCase();
  if (lower.includes('approved')) return 'Approved';
  if (lower.includes('rejected')) return 'Rejected';
  if (lower.includes('pending')) return 'Pending';
  return raw || 'Pending';
}

export default function DocumentsCenter({ initial }: { initial?: DocItem[] }) {
  const [items, setItems] = useState<DocItem[]>(initial || []);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [docType, setDocType] = useState<string>('identity');

  const API = (process.env.NEXT_PUBLIC_API_URL as string) || 'http://localhost:4000/api';

  useEffect(() => {
    async function loadDocs() {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        if (!token) return;
        const res = await fetch(`${API}/documents`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const json = await res.json();
        const docs = (json.documents || []).map((d: any) => ({ id: d.id, name: d.originalName, uploadedAt: d.uploadedAt, status: normalizeDocStatus(d.status), documentType: d.documentType || null }));
        setItems(docs);
      } catch (err) {
        console.error('load docs', err);
      }
    }
    loadDocs();
  }, []);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return alert('Choose a file');
    setUploading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) return alert('Login required');

      const fd = new FormData();
      fd.append('file', file);
      fd.append('documentType', docType);

      const res = await fetch(`${API}/documents/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const text = await res.text();
      let json;
      try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
      if (!res.ok) {
        console.error('upload failed', res.status, json);
        throw new Error('Upload failed');
      }

      // successful upload — refresh list
      const listRes = await fetch(`${API}/documents`, { headers: { Authorization: `Bearer ${token}` } });
      if (!listRes.ok) throw new Error('Failed to refresh document list');
      const listJson = await listRes.json();
      const docs = (listJson.documents || []).map((d: any) => ({ id: d.id, name: d.originalName, uploadedAt: d.uploadedAt, status: normalizeDocStatus(d.status), documentType: d.documentType || null }));
      setItems(docs);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      console.error(err);
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function downloadDoc(id: string) {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) return alert('Login required');

      // §30/§31: mint a short-lived signed URL (server enforces ownership +
      // privacy rules at signing time), then download via the public URL.
      const signRes = await fetch(`${API}/documents/${id}/sign`, { headers: { Authorization: `Bearer ${token}` } });
      if (!signRes.ok) return alert('Download failed');
      const signJson = await signRes.json();
      const signedUrl: string | undefined = signJson.url || signJson.path;
      if (!signedUrl) return alert('Download failed');

      const absolute = signedUrl.startsWith('http') ? signedUrl : `${window.location.origin}${signedUrl}`;
      const res = await fetch(absolute);
      if (!res.ok) return alert('Signed link expired — please try again');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = items.find((x) => x.id === id)?.name || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('download error', err);
      alert('Download failed');
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-[#f2d9a8] bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Documents &amp; Kundli Center</h3>
          <div className="text-sm text-[#6a4a57]">All documents are private and visible only to you and admin</div>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input ref={fileRef} type="file" className="rounded-xl border px-3 py-2" />
          <select value={docType} onChange={(e) => setDocType(e.target.value)} className="rounded-xl border px-3 py-2">
            <option value="identity">Identity Proof</option>
            <option value="address">Address Proof</option>
            <option value="education">Educational Certificate</option>
            <option value="income">Professional / Income Proof</option>
            <option value="photograph">Photograph</option>
            <option value="kundli">Kundli / Horoscope</option>
            <option value="other">Other</option>
          </select>
          <button disabled={uploading} onClick={handleUpload} className="rounded-xl bg-[#7b102d] px-4 py-2 text-sm font-semibold text-white">{uploading ? 'Uploading...' : 'Upload'}</button>
        </div>

        <div className="divide-y">
          {items.map((it) => {
            const status = normalizeDocStatus(it.status);
            const badgeClass = status === 'Approved' ? 'bg-[#eaf8ef] text-[#0a7d4c]' : status === 'Pending' ? 'bg-[#fff5d6] text-[#8a5a11]' : 'bg-[#ffecec] text-[#8a1d1d]';
            const label = it.documentType ? (docTypeLabels[it.documentType] || it.documentType) : null;

            return (
              <div key={it.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="font-semibold text-[#2c0d16]">{it.name} {label ? (<span className="ml-2 text-xs text-[#6a4a57]">({label})</span>) : null}</div>
                  <div className="text-xs text-[#6a4a57]">Uploaded {new Date(it.uploadedAt).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${badgeClass}`}>{status}</span>
                  <button onClick={() => downloadDoc(it.id)} className="rounded-md border px-3 py-1 text-sm">Download</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
