'use client'

/**
 * Document & Kundli management - `/customer/documents`.
 *
 * PURE PRESENTATION. The upload pipeline (file pick -> client-side
 * compression -> Supabase Storage PUT -> strict DB INSERT with `.select()`
 * -> refetch via fetchDocuments()) lives in
 * `app/customer/documents/page.tsx`. This component renders the list and
 * the upload picker; it does NOT maintain its own documents cache and
 * does NOT optimistically push fake rows into state. Insertion failures
 * are surfaced to the page, which raises an `alert()` per the brief.
 */

import React, { useMemo, useRef } from 'react';
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
import { formatBytes, type CustomerDocument, type DocumentType } from '@/lib/document-api';

export type DocumentsCenterProps = {
  /** Source of truth for "My Documents". Pulled from the database. */
  docs: CustomerDocument[];
  /** Currently-selected document type (controlled state). */
  docType: DocumentType;
  onDocTypeChange: (next: DocumentType) => void;
  /** Currently-picked file's metadata, if any. The page owns the File. */
  pickedFile: File | null;
  onPickedFile: (file: File | null) => void;
  /** Fired when the user clicks "Upload". Returns a promise that resolves
   *  when Supabase has returned the new row. The page must do the strict
   *  INSERT + refetch; this component only shows progress. */
  onUpload: () => Promise<void> | void;
  /** Local upload UX state. */
  uploading: boolean;
  uploadProgress: number;
  phaseMessage: string;
  /** Delete the document row + storage object. */
  onDelete: (id: string) => Promise<void> | void;
  /** Streaming download helper. */
  onDownload: (id: string, suggestedName: string) => Promise<boolean> | boolean;
  /** Notification toast for transient messages. */
  toast: { kind: 'success' | 'error' | 'info'; message: string } | null;
  onDismissToast: () => void;
};

const docTypeLabels: Record<string, string> = {
  identity: 'Identity Proof (Govt ID)',
  address: 'Address Proof',
  education: 'Educational Certificate',
  income: 'Professional / Income Proof',
  photograph: 'Photograph',
  kundli: 'Kundli / Horoscope',
  other: 'Other',
};

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
    return '\u2014';
  }
}

export default function DocumentsCenter(props: DocumentsCenterProps) {
  const {
    docs,
    docType,
    onDocTypeChange,
    pickedFile,
    onPickedFile,
    onUpload,
    uploading,
    uploadProgress,
    phaseMessage,
    onDelete,
    onDownload,
    toast,
    onDismissToast,
  } = props;

  const fileRef = useRef<HTMLInputElement | null>(null);

  const groupedByType = useMemo(() => {
    const buckets: Record<string, CustomerDocument[]> = {};
    for (const it of docs) {
      const k = String(it.documentType || 'other');
      if (!buckets[k]) buckets[k] = [];
      buckets[k].push(it);
    }
    return buckets;
  }, [docs]);

  function handlePick(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0] || null;
    onPickedFile(f);
  }

  function handleClear() {
    if (fileRef.current) fileRef.current.value = '';
    onPickedFile(null);
  }

  async function handleDelete(id: string) {
    const found = docs.find((x) => x.id === id);
    if (!found) return;
    const confirmed = window.confirm(
      `Delete "${found.name}" permanently? This will also remove the file from storage.`
    );
    if (!confirmed) return;
    await onDelete(id);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Non-modal status toast. Replaces `alert()` so a server HTML response
          can never bubble up as a modal dialog again. */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          onClick={onDismissToast}
          className={`fixed inset-x-0 top-4 z-50 mx-auto flex max-w-md cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold shadow-lg ${
            toast.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : toast.kind === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {toast.kind === 'success' ? <CheckCircle2 size={14} /> : toast.kind === 'error' ? <XCircle size={14} /> : <ShieldCheck size={14} />}
          <span className="truncate">{toast.message}</span>
        </div>
      )}

      {/* Upload box */}
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
            onChange={handlePick}
            className="block w-full rounded-xl border border-[#e6c98a] bg-[#fffaf3] px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#7b102d] file:px-3 file:py-1.5 file:font-bold file:text-white hover:file:bg-[#5a0a1f]"
          />
          <select
            value={docType}
            onChange={(e) => onDocTypeChange(e.target.value as DocumentType)}
            className="rounded-xl border border-[#e6c98a] bg-[#fffaf3] px-3 py-2 text-sm"
          >
            {DOCUMENT_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            disabled={uploading || !pickedFile}
            onClick={onUpload}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#7b102d] px-4 py-2 text-sm font-bold text-white hover:bg-[#5a0a1f] disabled:opacity-60"
          >
            {uploading ? <Loader2 className="animate-spin" size={16} /> : <UploadCloud size={16} />}
            {uploading ? 'Working\u2026' : 'Upload'}
          </button>
        </div>

        {pickedFile && !uploading && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-dashed border-[#e6c98a] bg-[#fffaf3] px-3 py-1.5 text-xs text-[#5a3743]">
            <span className="truncate">Picked: <strong>{pickedFile.name}</strong> ({formatBytes(pickedFile.size)})</span>
            <button type="button" onClick={handleClear} className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-[#7b102d] hover:bg-[#fbeeda]">
              Clear
            </button>
          </div>
        )}

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

      {/* Documents list */}
      <section className="rounded-2xl border border-[#f2d9a8] bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-[#2c0d16]">
            <FileText className="text-[#7b102d]" size={20} />
            My Documents
          </h3>
          <span className="rounded-full bg-[#fbeeda] px-3 py-1 text-xs font-bold text-[#7b102d]">
            {docs.length} {docs.length === 1 ? 'file' : 'files'}
          </span>
        </div>

        {docs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#f2d9a8] bg-[#fffaf3] p-8 text-center text-sm text-[#5a3743]">
            No documents uploaded yet. Pick a file above to get started.
          </div>
        ) : (
          <div className="divide-y divide-[#f4e6c2]">
            {docs.map((it) => {
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
                      {it.size ? ` \u2022 ${formatBytes(it.size)} on disk` : ''}
                      {status === 'Rejected' && it.rejectionReason
                        ? ` \u2022 Rejected: ${it.rejectionReason}`
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
                      onClick={() => onDownload(it.id, it.name)}
                      title="View / Download"
                      className="inline-flex items-center gap-1 rounded-full border border-[#d4a64a] bg-white px-3 py-1.5 text-xs font-bold text-[#7b102d] hover:bg-[#fff7ee]"
                    >
                      <Download size={12} /> Download
                    </button>
                    <button
                      onClick={() => handleDelete(it.id)}
                      title="Permanently delete"
                      className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Per-type quick stats */}
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
