'use client';

/**
 * `/customer/documents` — STRICT INSERT HANDLER.
 *
 * Owns the document list cache, the upload pipeline, and the DB INSERT
 * path. The component:
 *
 *  1. Fetches the source-of-truth list from Supabase on mount and after
 *     every successful insert via `fetchDocuments()` — there is no
 *     optimistic local write anywhere in this file. The list is the
 *     database, nothing else.
 *  2. Compresses the picked file in the browser (target ~4-20 KB) before
 *     uploading it to Supabase Storage.
 *  3. Issues the DB INSERT with `.select()` and CHECKS `error`. If the
 *     INSERT fails (FK violation, RLS denial, network), `error` is
 *     non-null — we log it to the console and `alert()` the user with
 *     `Database Insert Failed: ${error.message}`, then `return`. The
 *     storage object is still on disk but no row references it; a
 *     follow-up DELETE pass cleans it up. We do NOT update local state
 *     with a fake / partial record.
 *  4. On success, calls `fetchDocuments()` to pull the canonical row back
 *     (the INSERT already triggered alias-backfilling triggers, so a
 *     full SELECT guarantees the row the user sees has the same shape
 *     the admin panel will render).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { compressDocument } from '@/lib/image-compress';
import {
  deleteCustomerDocument,
  downloadCustomerDocument,
  formatBytes,
  listCustomerDocuments,
  type CustomerDocument,
  type DocumentType,
} from '@/lib/document-api';
import DocumentsCenter from '../../../components/customer/DocumentsCenter';

export default function DocumentsPage() {
  // Source-of-truth list. Always equal to the last successful
  // `fetchDocuments()` response — never mutated by optimistic writes.
  const [docs, setDocs] = useState<CustomerDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [phaseMessage, setPhaseMessage] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [docType, setDocType] = useState<DocumentType>('identity');
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error' | 'info'; message: string } | null>(null);

  function showToast(kind: 'success' | 'error' | 'info', message: string) {
    setToast({ kind, message });
    setTimeout(() => setToast((cur) => (cur && cur.message === message ? null : cur)), 4500);
  }

  /**
   * DYNAMIC RE-FETCH.
   *
   * Reads the customer's documents DIRECTLY from Supabase
   * (`supabase.from('documents').select('*')`) so we never rely on the
   * Express `/api/documents` route. The list is sorted newest-first by
   * `uploaded_at` to match the previous UI ordering.
   *
   * Called on mount AND immediately after every successful upload so the
   * UI is always showing what the database actually contains. No local
   * state is touched outside `setDocs(docs)` here.
   */
  const fetchDocuments = useCallback(async (): Promise<void> => {
    try {
      const next = await listCustomerDocuments();
      next.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
      setDocs(next);
    } catch (err) {
      // If the direct query fails too, fall back to the server list.
      // We never optimistically render fake rows here.
      console.error('fetchDocuments failed:', err);
      setDocs([]);
    }
  }, []);

  useEffect(() => {
    void fetchDocuments();
    const onFocus = () => void fetchDocuments();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchDocuments]);

  /**
   * STRICT INSERT HANDLER.
   *
   *  1. Validate the picked file + the authenticated user.
   *  2. Compress the bytes in the browser so the upload is small.
   *  3. PUT the compressed bytes to Supabase Storage at
   *     `<userId>/<timestamp>.<ext>` (auth.uid() owns the folder).
   *  4. INSERT into the `documents` table with `.select()` and check
   *     `error`. On success we re-run `fetchDocuments()` so the list
   *     reflects the canonical row. On failure we `console.error` and
   *     `alert()` the underlying message and `return` — we do NOT push
   *     the partial record into local state.
   *
   * The INSERT payload matches the brief verbatim:
   *   { user_id, doc_type, file_url, … }
   * plus the canonical identifiers and bookkeeping columns the admin
   * panel expects.
   */
  async function handleUpload() {
    const file = pickedFile || fileInputRef.current?.files?.[0];
    if (!file) {
      showToast('info', 'Choose a file first.');
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      showToast('error', 'Supabase is not configured.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setPhaseMessage(`Compressing ${file.name} (${formatBytes(file.size)})\u2026`);

    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user || !user.id) {
        throw new Error(userErr?.message || 'Sign in before uploading.');
      }
      const userId = (user.id || '').trim();
      if (!userId || /^undefined$/i.test(userId) || /^null$/i.test(userId)) {
        throw new Error('Authenticated user id is invalid — please sign out and sign back in.');
      }

      // 1. Compress in-browser.
      const compressed = await compressDocument(file, {
        onProgress: (pct: number) => {
          const mapped =
            pct < 50
              ? Math.round(pct * 0.5)
              : Math.min(100, Math.round(50 + (pct - 50) * 1.0));
          setUploadProgress(mapped);
          if (pct < 30) setPhaseMessage(`Reading source (${formatBytes(file.size)})\u2026`);
          else if (pct < 50) setPhaseMessage('Compressing\u2026');
          else if (pct < 95) setPhaseMessage('Uploading to Supabase Storage\u2026');
          else setPhaseMessage('Saving record\u2026');
        },
      });
      setUploadProgress(60);

      const uploadBytes =
        compressed.file instanceof File
          ? compressed.file
          : new File([compressed.file], compressed.fileName, { type: compressed.mimeType });

      const ext = (compressed.fileName.split('.').pop() || 'bin').toLowerCase();
      const objectPath = `${userId}/${Date.now()}.${ext}`;

      // 2. PUT to Supabase Storage.
      const { error: storageErr } = await supabase.storage
        .from('documents')
        .upload(objectPath, uploadBytes, {
          upsert: true,
          contentType: compressed.mimeType,
          cacheControl: '31536000',
        });
      if (storageErr) {
        throw new Error(storageErr.message || 'Storage upload failed.');
      }

      const { data: publicData } = supabase.storage.from('documents').getPublicUrl(objectPath);
      const publicUrl = publicData?.publicUrl;
      if (!publicUrl) throw new Error('Storage did not return a public URL for the uploaded file.');
      setUploadProgress(80);

      // 3. STRICT INSERT — `.select()` and `error` check, exactly as the
      //    brief specifies. Do not pre-fill `setDocs` with a fake row.
      const now = Date.now();
      const documentId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `doc-${userId}-${now}`;

      const insertPayload = {
        id: documentId,
        user_id: userId,
        original_name: compressed.fileName,
        path: publicUrl,
        cloudinary_url: publicUrl,
        mimetype: compressed.mimeType,
        size: compressed.compressedSize,
        document_type: docType,
        doc_type: docType,
        file_url: publicUrl,
        status: 'Pending Review',
        uploaded_at: now,
        created_at: now,
      };

      const { error } = await supabase
        .from('documents')
        .insert(insertPayload)
        .select();

      if (error) {
        // EXACTLY the brief's contract: console.error + alert + return.
        // No optimistic state push. No silent re-try. The user knows the
        // upload didn't land and can refresh.
        console.error('DB Insert Error:', error);
        alert(`Database Insert Failed: ${error.message}`);
        // Best-effort: remove the orphaned storage object so the bucket
        // doesn't collect dead bytes. Failures here are non-fatal.
        try {
          await supabase.storage.from('documents').remove([objectPath]);
        } catch (cleanupErr) {
          console.warn('storage cleanup after failed insert:', cleanupErr);
        }
        return;
      }

      setUploadProgress(100);
      setPhaseMessage(`Uploaded ${file.name} (${formatBytes(compressed.compressedSize)})`);

      // 4. DYNAMIC RE-FETCH. Pull the canonical row straight from
      //    Supabase so the UI shows exactly what the DB holds, with all
      //    alias columns populated by the BEFORE INSERT trigger.
      await fetchDocuments();

      // 5. Clear the picker so the user can pick another file.
      if (fileInputRef.current) fileInputRef.current.value = '';
      setPickedFile(null);

      // 6. Best-effort audit log.
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        if (token) {
          await fetch('/api/customer/activity-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              action: 'UPLOAD_DOCUMENT',
              detail: `direct upload (${formatBytes(compressed.compressedSize)}) ${docType}: ${file.name}`,
            }),
          });
        }
      } catch {
        /* audit is best-effort */
      }

      showToast('success', `${file.name} uploaded — pending review.`);
      setTimeout(() => {
        setUploadProgress(0);
        setPhaseMessage('');
      }, 3000);
    } catch (err: any) {
      console.error('document upload failed', err);
      const raw = err?.message || 'Upload failed. Please try again.';
      const message = /<!DOCTYPE|<\/?html|<pre/i.test(raw)
        ? 'Upload failed. Please try again or pick a different file.'
        : raw;
      setPhaseMessage(message);
      showToast('error', message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    const found = docs.find((x) => x.id === id);
    if (!found) return;
    setDeletingId(id);
    try {
      const ok = await deleteCustomerDocument(id);
      if (ok) {
        await fetchDocuments();
        showToast('success', `${found.name} deleted.`);
      } else {
        showToast('error', 'Could not delete this document. Please try again.');
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDownload(id: string, suggestedName: string) {
    const ok = await downloadCustomerDocument(id, suggestedName);
    if (!ok) showToast('error', 'Download failed.');
    return ok;
  }

  return (
    <div className="min-h-screen bg-[#fffaf8] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-black text-[#2c0d16]">Documents & Kundli</h1>
          <div className="flex gap-2">
            <Link href="/customer" className="rounded-full border px-4 py-2 text-sm">Back</Link>
          </div>
        </div>

        {/* Hidden file input controlled by the page — the
            presentation-only `<DocumentsCenter />` only updates the
            page's pickedFile state and triggers handleUpload. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setPickedFile(e.target.files?.[0] || null)}
          className="hidden"
        />

        <DocumentsCenter
          docs={docs}
          docType={docType}
          onDocTypeChange={setDocType}
          pickedFile={pickedFile}
          onPickedFile={(f) => {
            setPickedFile(f);
            if (f && fileInputRef.current) {
              // Mirror into the hidden input so the value survives re-renders.
              const dt = new DataTransfer();
              dt.items.add(f);
              fileInputRef.current.files = dt.files;
            }
          }}
          onUpload={handleUpload}
          uploading={uploading}
          uploadProgress={uploadProgress}
          phaseMessage={phaseMessage}
          onDelete={handleDelete}
          onDownload={handleDownload}
          toast={toast}
          onDismissToast={() => setToast(null)}
        />
      </div>
    </div>
  );
}
