// Client-side document helpers: compression before upload, signed-URL download,
// and Delete. Wraps the lower-level /api/documents/* endpoints with the same
// auth-handling as `lib/api-client` and the proven blob:URL previews used for
// avatars. Browser-only: import from a Client Component.

import { compressDocument, formatBytes, type CompressedDocument } from '@/lib/image-compress';
import { getSupabase } from '@/lib/supabase';

export type DocumentType =
  | 'identity'
  | 'address'
  | 'education'
  | 'income'
  | 'photograph'
  | 'kundli'
  | 'other';

export type CustomerDocument = {
  id: string;
  name: string;
  uploadedAt: number;
  status: 'Pending' | 'Pending Review' | 'Approved' | 'Rejected';
  documentType: DocumentType | string | null;
  rejectionReason?: string | null;
  size?: number;
  mimetype?: string;
  /**
   * `server` came back from the Express `/api/documents/upload` route;
   * `direct` came from the client→Supabase Storage fallback path used when
   * the server is unreachable. Helps the UI tag the source honestly.
   */
  source?: 'server' | 'direct';
};

/**
 * Parse the body of a fetch response safely. Returns a structured error with
 * the server message when one is present, or a generic "Upload failed"
 * otherwise. The previous implementation aliased the raw HTML body to
 * `err.message`, which the alert() then bubbled to the user verbatim —
 * literally the page shown in the screenshot.
 */
async function readJsonError(res: Response, fallbackMessage: string): Promise<{ ok: true; json: any } | { ok: false; error: string }> {
  const text = await res.text();
  if (!text) {
    return { ok: false, error: res.ok ? fallbackMessage : `Request failed (${res.status})` };
  }

  // Sniff content-type — if the server shipped HTML, surface a generic
  // message rather than dumping the markup.
  const ctype = res.headers.get('content-type') || '';
  if (!ctype.includes('json') && !ctype.includes('text/plain')) {
    return {
      ok: false,
      error: res.ok
        ? fallbackMessage
        : `Server returned ${res.status} but the body wasn't JSON — falling back to direct upload.`,
    };
  }

  let json: any = null;
  try { json = JSON.parse(text); } catch {
    return { ok: false, error: `Could not parse server response (${res.status})` };
  }
  if (res.ok && (json?.success || json?.ok)) return { ok: true, json };
  return { ok: false, error: json?.error || json?.message || `Request failed (${res.status})` };
}

/**
 * Direct client → Supabase Storage fallback. Used when the Express upload
 * route returns 5xx, network-fails, or otherwise appears down. The object is
 * written under `<authUserId>/<timestamp>.<ext>` so the RLS policy
 * `(foldername(name))[1] = auth.uid()` allows it; a row is then inserted
 * directly into the `documents` table.
 *
 * Returns the same `CustomerDocument` shape as the server path so the
 * front-end doesn't need to branch.
 */
export async function uploadDocumentDirect(
  file: File,
  documentType: DocumentType,
  options: { onProgress?: (percent: number) => void } = {}
): Promise<{ record: CustomerDocument; compressed: CompressedDocument }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured — direct upload unavailable.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in before uploading.');

  const compressed = await compressDocument(file, { onProgress: options.onProgress });

  // Build the upload payload — bytes + filename + mimetype.
  const uploadPayload =
    compressed.file instanceof File
      ? compressed.file
      : new File([compressed.file], compressed.fileName, { type: compressed.mimeType });

  const ext = (compressed.fileName.split('.').pop() || 'bin').toLowerCase();
  const objectPath = `${user.id}/${Date.now()}.${ext}`;
  options.onProgress?.(85);

  // Supabase JS upload. Throws on RLS denial / network errors; the caller
  // surfaces a clear message in that case.
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(objectPath, uploadPayload, {
      upsert: true,
      contentType: compressed.mimeType,
      cacheControl: '31536000',
    });
  if (uploadError) {
    throw new Error(uploadError.message || 'Direct storage upload failed.');
  }

  // Build a public URL — bucket is public.
  const { data: publicData } = supabase.storage.from('documents').getPublicUrl(objectPath);
  const fileUrl = publicData?.publicUrl;
  if (!fileUrl) throw new Error('Storage did not return a public URL for the uploaded file.');

  // Insert the database row using the same column set the server uses, so the
  // admin panel and customer dashboard render it consistently.
  const now = Date.now();
  const insertPayload = {
    id: (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `doc-${user.id}-${now}`,
    user_id: user.id,
    original_name: compressed.fileName,
    path: fileUrl,
    cloudinary_url: fileUrl,
    mimetype: compressed.mimeType,
    size: compressed.compressedSize,
    document_type: documentType,
    doc_type: documentType,
    file_url: fileUrl,
    status: 'Pending Review',
    uploaded_at: now,
    created_at: now,
  };

  const { data: insertData, error: insertError } = await supabase
    .from('documents')
    .insert(insertPayload)
    .select('id, original_name, uploaded_at, status, document_type, doc_type, mimetype, size, file_url')
    .single();
  if (insertError) {
    throw new Error(insertError.message || 'Could not record document row in the database.');
  }

  options.onProgress?.(100);
  const r = insertData || insertPayload;
  const record: CustomerDocument = {
    id: r.id,
    name: r.original_name || compressed.fileName,
    uploadedAt: r.uploaded_at || now,
    status: (r.status as CustomerDocument['status']) || 'Pending Review',
    documentType: r.document_type || r.doc_type || documentType,
    rejectionReason: null,
    size: r.size || compressed.compressedSize,
    mimetype: r.mimetype || compressed.mimeType,
    source: 'direct',
  };
  return { record, compressed };
}

/**
 * Compresses a picked file to the brief's 4-20 KB band and uploads it.
 *
 * STRATEGY (revised 2026-09-01 after the production "Request aborted" toast):
 *
 *   The Express route is no longer the primary path because Vercel's 10 s
 *   serverless-function ceiling combined with the Cloudinary CDN replication
 *   step previously killed the browser fetch mid-upload. We still go to
 *   Supabase Storage directly — the file is already compressed in the
 *   browser so the network round-trip is sub-second.
 *
 *   1. Try DIRECT upload to Supabase Storage + insert documents row.
 *      The Supabase JS client signs the upload with the user's anon JWT,
 *      the bucket is public so getPublicUrl() returns a working URL, and
 *      the RLS policy `auth.uid() = folder[0]` admits only the owner.
 *   2. If direct fails (no Supabase session, RLS misconfiguration, network
 *      error), fall back to the Express route.
 *   3. Best-effort audit log via `POST /api/customer/activity-log` so the
 *      admin live-activity feed still sees the upload.
 *
 * Returns the persisted record plus the compression result. The caller can
 * listen to progress via options.onProgress.
 */
export async function uploadCompressedDocument(
  file: File,
  documentType: DocumentType,
  options: { token?: string | null; onProgress?: (percent: number) => void } = {}
): Promise<{ record: CustomerDocument; compressed: CompressedDocument; usedFallback: boolean }> {
  // Compress first so the network payload is small regardless of path.
  const compressed = await compressDocument(file, { onProgress: options.onProgress });
  options.onProgress?.(50);

  // ── 1) Try DIRECT Supabase path ──────────────────────────────────────────
  try {
    const direct = await uploadDocumentDirect(file, documentType, {
      onProgress: (pct) => options.onProgress?.(Math.max(50, pct)),
    });
    options.onProgress?.(95);

    // Best-effort audit log entry — fire-and-forget so the customer's UI
    // experience is never blocked on the server.
    try {
      const token = options.token ?? (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
      if (token) {
        fetch('/api/customer/activity-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            action: 'UPLOAD_DOCUMENT',
            detail: `direct upload (${formatBytes(compressed.compressedSize)}) ${documentType}: ${file.name}`,
          }),
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* audit log is best-effort */
    }

    options.onProgress?.(100);
    return { record: { ...direct.record, source: 'direct' }, compressed, usedFallback: false };
  } catch (directErr: any) {
    const directMessage = directErr?.message || 'Direct upload failed.';
    // Only fall back if there is a chance the server route will succeed
    // (i.e., the file is in the size envelope and an auth token exists).
    const token = options.token ?? (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
    if (!token) {
      // No platform JWT — server route cannot authenticate either.
      throw new Error(`Direct upload failed and no platform session was found. Please sign in again. (${directMessage})`);
    }
    options.onProgress?.(70);
    const { record: serverRecord, compressed: serverCompressed } = await uploadViaServer(file, compressed, documentType, token);
    options.onProgress?.(100);

    return {
      record: { ...serverRecord, source: 'server' },
      compressed: serverCompressed,
      usedFallback: true,
    };
  }
}

/**
 * Server-route upload used only as a fallback when the direct path fails.
 * Wraps the round-trip in structured-JSON reading so the same code never
 * silently bubbles HTML into a toast.
 */
async function uploadViaServer(
  file: File,
  compressed: CompressedDocument,
  documentType: DocumentType,
  token: string
): Promise<{ record: CustomerDocument; compressed: CompressedDocument }> {
  const fd = new FormData();
  const uploadBlob =
    compressed.file instanceof File
      ? compressed.file
      : new File([compressed.file], compressed.fileName, { type: compressed.mimeType });
  fd.append('file', uploadBlob);
  fd.append('documentType', documentType);

  let res: Response;
  try {
    // 25s ceiling — past this the upload is almost certainly stalled on
    // Vercel's serverless ceiling anyway, and we'd rather see the toast.
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 25_000);
    res = await fetch('/api/documents/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
  } catch (networkErr: any) {
    // Network / abort paths get a clearer message than the generic
    // "Request aborted" the browser ships by default.
    const aborted = networkErr?.name === 'AbortError' || /abort/i.test(networkErr?.message || '');
    throw new Error(aborted
      ? 'Upload timed out. The server is taking too long to respond — please retry with a smaller file.'
      : `Network error talking to the server: ${networkErr?.message || 'unknown'}`);
  }

  const parsed = await readJsonError(res, 'Server rejected the upload.');
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  const f = parsed.json.file || parsed.json;
  return {
    record: {
      id: f.id,
      name: f.originalName || compressed.fileName,
      uploadedAt: f.uploadedAt || Date.now(),
      status: f.status || 'Pending Review',
      documentType: f.documentType || documentType,
      rejectionReason: f.rejectionReason || null,
      size: f.size || compressed.compressedSize,
      mimetype: f.mimetype || compressed.mimeType,
      source: 'server',
    },
    compressed,
  };
}

function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Lists the signed-in user's documents. Tries the server first; on 5xx /
 * network failure falls back to a direct Supabase query so the dashboard
 * remains responsive even if the Express API is down.
 */
export async function listCustomerDocuments(): Promise<CustomerDocument[]> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const userId = typeof window !== 'undefined' ? localStorage.getItem('shubhSanjogUser') : null;
  // 1) Server list
  try {
    if (token) {
      const res = await fetch('/api/documents', { headers: authHeaders() });
      if (res.ok) {
        const json = await res.json();
        const docs = (json.documents || []) as any[];
        return docs.map((d) => ({
          id: d.id,
          name: d.originalName,
          uploadedAt: d.uploadedAt,
          status: d.status,
          documentType: d.documentType || null,
          rejectionReason: d.rejectionReason || null,
          size: d.size,
          mimetype: d.mimetype,
          source: 'server' as const,
        }));
      }
    }
  } catch {
    /* fall through to direct query */
  }

  // 2) Direct Supabase query (only when the user is signed in via Supabase).
  try {
    const supabase = getSupabase();
    if (!supabase) return [];
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from('documents')
      .select('id, original_name, uploaded_at, status, document_type, doc_type, rejection_reason, size, mimetype, file_url')
      .eq('user_id', user.id)
      .order('uploaded_at', { ascending: false });
    if (error || !data) return [];
    return data.map((r: any) => ({
      id: r.id,
      name: r.original_name,
      uploadedAt: Number(r.uploaded_at) || Date.now(),
      status: r.status,
      documentType: r.document_type || r.doc_type || null,
      rejectionReason: r.rejection_reason || null,
      size: r.size,
      mimetype: r.mimetype,
      source: 'direct' as const,
    }));
  } catch {
    return [];
  }
}

/**
 * Delete a document. Tries the server route first; on 5xx / network failure
 * removes the Supabase Storage object and the documents row directly.
 * Audit-logging only happens server-side; direct deletes leave a gap in the
 * audit log that the admin can see.
 */
export async function deleteCustomerDocument(id: string): Promise<boolean> {
  // 1) Server delete
  try {
    const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (res.ok) return true;
    // 5xx → try direct. 4xx → surface the server's message and stop.
    if (res.status >= 400 && res.status < 500) {
      const parsed = await readJsonError(res, 'Delete failed');
      throw new Error(parsed.ok ? 'Delete failed' : parsed.error);
    }
  } catch (err: any) {
    if (err instanceof Error && /\b400\b|\b401\b|\b403\b|\b404\b/.test(err.message)) {
      alert(err.message);
      return false;
    }
    // fall through to direct
  }

  // 2) Direct Supabase delete — best-effort, succeeds even when the API
  // is unreachable.
  try {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { data: row, error: readErr } = await supabase
      .from('documents')
      .select('file_url, user_id')
      .eq('id', id)
      .maybeSingle();
    if (!readErr && row?.file_url) {
      try {
        const url = new URL(row.file_url);
        const marker = '/storage/v1/object/public/documents/';
        const idx = url.pathname.indexOf(marker);
        if (idx >= 0) {
          const objectPath = decodeURIComponent(url.pathname.slice(idx + marker.length));
          await supabase.storage.from('documents').remove([objectPath]);
        }
      } catch {
        /* URL parse / remove failure is non-fatal — the row will still go */
      }
    }
    const { error: delErr } = await supabase.from('documents').delete().eq('id', id);
    return !delErr;
  } catch {
    return false;
  }
}

/**
 * Fetch a download URL the server has signed and trigger a browser download
 * to the user's machine.
 *
 * Public documents (the `documents` bucket is public since the latest
 * migration) can also be downloaded directly via the public URL — we try
 * that path first so the user gets their file even when the Express API is
 * down, and only fall back to the signed route for old rows with private
 * Cloudinary URLs.
 */
export async function downloadCustomerDocument(
  id: string,
  suggestedName: string
): Promise<boolean> {
  try {
    // Direct path: read the row from Supabase and stream the public URL.
    try {
      const supabase = getSupabase();
      if (supabase) {
        const { data: row } = await supabase
          .from('documents')
          .select('file_url, original_name, cloudinary_url')
          .eq('id', id)
          .maybeSingle();
        const url = row?.file_url || row?.cloudinary_url;
        if (url && /^https?:\/\//.test(url)) {
          const resp = await fetch(url);
          if (resp.ok) {
            const blob = await resp.blob();
            const objectUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = suggestedName || row?.original_name || 'download';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(objectUrl);
            return true;
          }
        }
      }
    } catch {
      /* fall through to signed-URL path */
    }

    const headers = authHeaders();
    if (!headers.Authorization) return false;
    const sign = await fetch(`/api/documents/${encodeURIComponent(id)}/sign`, { headers });
    if (!sign.ok) return false;
    const signJson = await sign.json();
    const signedUrl: string | undefined = signJson.url || signJson.path;
    if (!signedUrl) return false;
    const absolute = signedUrl.startsWith('http') ? signedUrl : `${window.location.origin}${signedUrl}`;
    const res = await fetch(absolute);
    if (!res.ok) return false;
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

export { formatBytes };
