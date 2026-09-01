'use client'

/**
 * Document & Kundli management — `/customer/documents`.
 *
 * Pipeline: pick any file → client-side compression to ~4-20 KB → upload via
 * the Express `/api/documents/upload` endpoint → live list updates with
 * View/Download and Delete actions. Same component renders both the upload
 * box and the listing; verified badges are rendered separately by
 * `components/customer/DocumentBadges.tsx` so the customer dashboard stays
 * legible.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  ShieldCheck,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import {
  deleteCustomerDocument,
  downloadCustomerDocument,
  formatBytes,
  listCustomerDocuments,
  uploadCompressedDocument,
  type CustomerDocument,
  type DocumentType,
} from '@/lib/document-api';

const docTypeLabels: Record<string, string> = {
  identity: 'Identity Proof (Govt ID)',
  address: 'Address Proof',
  education: 'Educational Certificate',
  income: 'Professional / Income Proof',
  photograph: 'Photograph',
  kundli: 'Kundli / Horoscope',
  other: 'Other',
};

// Friendly upload category → server-side document_type. Keep in sync with
// `server/controllers/documentsController.js` (the `identity` default is also
// mirrored there).
const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'identity', label: 'Identity Proof (Govt ID)' },
  { value: 'address', label: 'Address Proof' },
  { value: 'education', label: 'Educational Certificate' },
  { value: 'income', label: 'Professional / Income Proof' },
  { value: 'kundli', label: 'Kundli / Horoscope' },
  { value: 'photograph', label: 'Photograph' },
  { value: 'other', label: 'Other' },
];

function normalizeStatus(status?: string | null): CustomerDocument['status'] {
  const raw = String(status || 'Pending Review').trim();
  const lower = raw.toLowerCase();
  if (lower.includes('approved')) return 'Approved';
  if (lower.includes('rejected')) return 'Rejected';
  if (lower.includes('pending')) return 'Pending';
  return (raw as CustomerDocument['status']) || 'Pending Review';
}

function statusBadge(status: CustomerDocument['status']) {
  if (status === 'Approved') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Rejected') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function formatDate(ms: number) {
  try {
    return new Date(ms).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function DocumentsCenter({ initial }: { initial?: CustomerDocument[] } = {}) {
  const [items, setItems] = useState<CustomerDocument[]>(initial || []);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [phaseMessage, setPhaseMessage] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [docType, setDocType] = useState<DocumentType>('identity');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    const docs = await listCustomerDocuments();
    // sort newest first
    docs.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
    setItems(docs);
  };

  useEffect(() => {
    void refresh();
    // re-fetch when the tab regains focus so the list stays accurate after
    // the user closes/reopens the page.
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  /**
   * Pick a file, compress in the browser, then upload. We never feed the raw
   * picked bytes to the server — `uploadCompressedDocument` always passes
   * the post-compression payload.
   */
  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      alert('Choose a file first.');
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    setPhaseMessage(`Compressing ${file.name} (${formatBytes(file.size)})…`);

    try {
      const { record, compressed } = await uploadCompressedDocument(file, docType, {
        onProgress: (pct) => {
          setUploadProgress(Math.min(80, Math.round(pct * 0.8))); // 0-80% reserved for compression
          if (pct < 30) setPhaseMessage(`Reading source (${formatBytes(file.size)})…`);
          else if (pct < 90) setPhaseMessage(`Compressing…`);
          else setPhaseMessage('Uploading…');
        },
      });
      setUploadProgress(85);
      setPhaseMessage(`Uploaded ${record.name} (${formatBytes(compressed.compressedSize)})`);

      // Optimistic UI: prepend the new record. The next focus/refresh will
      // reconcile any divergence.
      setItems((prev) => [record, ...prev.filter((p) => p.id !== record.id)]);

      // Brief settle, then poll the server once in case anyone else touched
      // this user's docs concurrently.
      setTimeout(() => void refresh(), 800);
      setTimeout(() => {
        setUploadProgress(0);
        setPhaseMessage('');
      }, 3000);

      if (fileRef.current) fileRef.current.value = '';
    } catch (err: any) {
      console.error('document upload failed', err);
      alert(err?.message || 'Upload failed');
      setPhaseMessage(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    const found = items.find((x) => x.id === id);
    if (!found) return;
    const confirmed = window.confirm(
      `Delete "${found.name}" permanently? This will also remove the file from storage.`
    );
    if (!confirmed) return;
    setDeletingId(id);
    const ok = await deleteCustomerDocument(id);
    setDeletingId(null);
    if (ok) {
      setItems((prev) => prev.filter((p) => p.id !== id));
    } else {
      alert('Could not delete this document. Please try again.');
    }
  }

  async function handleDownload(id: string) {
    const found = items.find((x) => x.id === id);
    const ok = await downloadCustomerDocument(id, found?.name || 'document');
    if (!ok) alert('Download failed.');
  }

  const groupedByType = useMemo(() => {
    const buckets: Record<string, CustomerDocument[]> = {};
    for (const it of items) {
      const k = String(it.documentType || 'other');
      if (!buckets[k]) buckets[k] = [];
      buckets[k].push(it);
    }
    return buckets;
  }, [items]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ── Upload box ──────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[#f2d9a8] bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-lg font-bold text-[#2c0d16]">
            <UploadCloud className="text-[#7b102d]" size={20} />
            Upload a new document
          </h3>
          <span className="text-xs font-semibold text-[#6a4a57]">
            Compressed in your browser before upload (target ~4-20&nbsp;KB)
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto]">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="block w-full rounded-xl border border-[#e6c98a] bg-[#fffaf3] px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#7b102d] file:px-3 file:py-1.5 file:font-bold file:text-white hover:file:bg-[#5a0a1f]"
          />
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocumentType)}
            className="rounded-xl border border-[#e6c98a] bg-[#fffaf3] px-3 py-2 text-sm"
          >
            {DOCUMENT_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            disabled={uploading}
            onClick={handleUpload}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#7b102d] px-4 py-2 text-sm font-bold text-white hover:bg-[#5a0a1f] disabled:opacity-60"
          >
            {uploading ? <Loader2 className="animate-spin" size={16} /> : <UploadCloud size={16} />}
            {uploading ? 'Working…' : 'Upload'}
          </button>
        </div>

        {uploading && (
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#f4e6c2]">
              <div
                className="h-full rounded-full bg-[#7b102d] transition-[width] duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <div className="mt-1 text-xs font-semibold text-[#6a4a57]">{phaseMessage}</div>
          </div>
        )}
      </section>

      {/* ── Documents list ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[#f2d9a8] bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-[#2c0d16]">
            <FileText className="text-[#7b102d]" size={20} />
            My Documents
          </h3>
          <span className="rounded-full bg-[#fbeeda] px-3 py-1 text-xs font-bold text-[#7b102d]">
            {items.length} {items.length === 1 ? 'file' : 'files'}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#f2d9a8] bg-[#fffaf3] p-8 text-center text-sm text-[#5a3743]">
            No documents uploaded yet. Pick a file above to get started.
          </div>
        ) : (
          <div className="divide-y divide-[#f4e6c2]">
            {items.map((it) => {
              const status = normalizeStatus(it.status);
              const typeLabel =
                docTypeLabels[String(it.documentType || '')] || String(it.documentType || 'document');
              return (
                <div key={it.id} className="grid grid-cols-[1fr_auto] gap-3 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-[#2c0d16]" title={it.name}>
                      {it.name}
                      <span className="ml-2 rounded-md bg-[#fbeeda] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#7b102d]">
                        {typeLabel}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[#6a4a57]">
                      Uploaded {formatDate(it.uploadedAt)}
                      {it.size ? ` • ${formatBytes(it.size)} on disk` : ''}
                      {status === 'Rejected' && it.rejectionReason
                        ? ` • Rejected: ${it.rejectionReason}`
                        : ''}
                    </div>
                    <div className="mt-1">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusBadge(status)}`}>
                        {status === 'Approved' && <CheckCircle2 size={12} />}
                        {status === 'Rejected' && <XCircle size={12} />}
                        {status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleDownload(it.id)}
                      title="View / Download"
                      className="inline-flex items-center gap-1 rounded-full border border-[#d4a64a] bg-white px-3 py-1.5 text-xs font-bold text-[#7b102d] hover:bg-[#fff7ee]"
                    >
                      <Download size={12} /> Download
                    </button>
                    <button
                      onClick={() => handleDelete(it.id)}
                      disabled={deletingId === it.id}
                      title="Permanently delete"
                      className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                    >
                      {deletingId === it.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Per-type quick stats ───────────────────────────────────────────── */}
      {Object.keys(groupedByType).length > 0 && (
        <section className="rounded-2xl border border-[#f2d9a8] bg-[#fffaf3] p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#2c0d16]">
            <ShieldCheck className="text-[#7b102d]" size={16} />
            Verified documents by type
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(groupedByType).map(([type, list]) => {
              const approved = list.filter((d) => normalizeStatus(d.status) === 'Approved').length;
              const label = docTypeLabels[type] || type;
              return (
                <div key={type} className="rounded-xl border border-[#f2d9a8] bg-white p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[#6a4a57]">{label}</div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xl font-black text-[#7b102d]">{approved}</span>
                    <span className="text-xs font-medium text-[#6a4a57]">/ {list.length} approved</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
