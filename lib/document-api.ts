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
  if (!user.id) throw new Error('Authenticated user has no id — please sign out and sign back in.');

  // ── Validate the user id ──────────────────────────────────────────────────
  // The `documents.user_id` column has a foreign-key constraint. The FK
  // target is the Supabase auth uid string. Reject any falsy value BEFORE
  // we issue any DB call so the documents INSERT can never go out with an
  // undefined or empty `user_id` (which Postgres rejects as 23502, not
  // 23503, and would mask the real FK violation).
  const userId = (user.id || '').trim();
  if (!userId) {
    throw new Error('Authenticated user has an empty id — please sign out and sign back in.');
  }
  // Also reject the literal string "undefined" that older Supabase SDK
  // versions surfaced when the JWT was missing. Anything non-empty that
  // isn't a Supabase auth uid would still trip the FK, but this catches
  // the degenerate case from leaking into the INSERT.
  if (/^undefined$/i.test(userId) || /^null$/i.test(userId)) {
    throw new Error('Authenticated user id is invalid — please sign out and sign back in.');
  }

  const compressed = await compressDocument(file, { onProgress: options.onProgress });

  // ── Ensure a `profiles` row exists for userId ─────────────────────────────
  // `documents.user_id` has a FK pointing at `users(id)` (current production
  // schema) or, on installs where the column was retargeted, `profiles(id)`.
  // Either way the Supabase auth uid is the row's PK. The Express auth flow
  // populates `users` on session exchange, but a customer who signs in
  // purely through the browser (normal Google OAuth) lands here before any
  // `/api/auth/supabase-session` call, so neither `users(id)` nor
  // `profiles(id)` is populated yet. The downstream INSERT then dies with
  // `violates foreign key constraint "documents_user_id_fkey"`. Proactive
  // upsert avoids the whole class.
  //
  // We upsert BOTH tables to satisfy whichever one the live FK actually
  // points at. Both writes are idempotent (`onConflict: 'id'`) and safe to
  // call on every upload.
  options.onProgress?.(60);
  const userForRow = { ...user, id: userId };
  await ensureProfileRow(supabase, userForRow);
  await ensureUserRow(supabase, userForRow);

  // Build the upload payload — bytes + filename + mimetype.
  const uploadPayload =
    compressed.file instanceof File
      ? compressed.file
      : new File([compressed.file], compressed.fileName, { type: compressed.mimeType });

  const ext = (compressed.fileName.split('.').pop() || 'bin').toLowerCase();
  const objectPath = `${userId}/${Date.now()}.${ext}`;
  options.onProgress?.(80);

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
  // Use the SAME `userId` string for every FK reference (documents.user_id,
  // documents-related tables downstream). It came from supabase.auth.getUser()
  // and is therefore the canonical Supabase auth uid. We already validated
  // above that it's a non-empty, non-"undefined"/"null" string.
  const insertPayload = {
    id: (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `doc-${userId}-${now}`,
    user_id: userId,
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
 * Type narrowing for the Supabase client. We avoid pulling in `@supabase/supabase-js`
 * types here at the top level because `lib/document-api.ts` is browser-only and
 * the rest of the file uses generic `any` shapes — a narrow alias keeps the
 * call sites readable.
 */
type SupabaseClient = ReturnType<typeof getSupabase>;

type AuthedUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

/**
 * Upsert the `profiles` row for a freshly authenticated browser session.
 *
 * The `profiles` table (`supabase/profiles_migration.sql`) has `id text
 * primary key` where `id = Supabase auth uid`. Some installs retarget the
 * `documents.user_id` foreign key at `profiles(id)` instead of `users(id)`.
 * Either way, populating the row before the documents INSERT defeats the
 * `documents_user_id_fkey` violation that surfaced when a customer signed
 * in purely through the browser (no Express `/api/auth/supabase-session`
 * call has populated the row yet).
 *
 * The payload is the explicit shape prescribed for this fix:
 *
 *   { id: user.id, email: user.email,
 *     full_name: user.user_metadata?.full_name || 'User' }
 *
 * The `'User'` fallback keeps `full_name` non-null so any NOT NULL or
 * CHECK constraint on the column is satisfied. `id` is the validated
 * `userId` (non-empty, non-'undefined', non-'null') from the caller.
 * RLS is OFF on `public.profiles` so the browser-side client can write
 * directly with the user's JWT.
 *
 * The upsert is idempotent (`onConflict: 'id'`) — re-runs on every
 * upload are safe and a no-op when the row already exists.
 */
async function ensureProfileRow(
  supabase: NonNullable<SupabaseClient>,
  user: AuthedUser
): Promise<void> {
  // 1. Check the row first. If it already exists we skip the write
  //    entirely — saves a round trip and avoids overwriting admin-side
  //    edits to `is_completed`, `dob`, etc.
  const { data: existing, error: readErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  // "relation does not exist" (the migration wasn't applied) is
  // tolerated — the parallel `ensureUserRow` call covers the FK, so
  // we can return silently here.
  if (readErr) {
    if (!/does not exist/i.test(readErr.message || '')) {
      // Non-fatal warning: the INSERT below will surface a real failure
      // if the FK is genuinely unsatisfied.
      console.warn('[documents] profiles SELECT skipped:', readErr.message);
    }
    return;
  }
  if (existing?.id) return;

  // 2. Exact payload shape required by the brief.
  const metadata = (user.user_metadata || {}) as Record<string, unknown>;
  const rawFullName = metadata.full_name;
  const fullName =
    typeof rawFullName === 'string' && rawFullName.trim()
      ? rawFullName.trim()
      : 'User';

  const payload = {
    id: user.id,
    email: user.email || null,
    full_name: fullName,
  };

  const { error: upsertErr } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id', ignoreDuplicates: false });

  if (upsertErr) {
    const msg = upsertErr.message || '';
    // Duplicate-key = a parallel request raced us into the row; quiet win.
    // "relation does not exist" / schema-cache races = non-fatal here too,
    // because the parallel `ensureUserRow` covers the FK.
    if (
      !/duplicate key/i.test(msg) &&
      !/does not exist/i.test(msg) &&
      !/relation.*not found/i.test(msg)
    ) {
      console.warn('[documents] profiles upsert skipped:', msg);
    }
  }
}

/**
 * Upsert the parallel `users` row (legacy / FK-alternate target).
 *
 * Kept alongside `ensureProfileRow` because some installs have the FK on
 * `documents.user_id` pointing at `users(id)` (`supabase/schema.sql:57`),
 * others have it pointing at `profiles(id)`. Doing both writes means the
 * FK is satisfied regardless of which table the live schema targets.
 *
 * The `id` column on `public.users` IS the Supabase auth uid, so the
 * upsert is idempotent — running it on every upload is safe. We only set
 * fields that are missing so we never overwrite admin-side edits (role,
 * deleted_at, etc.).
 */
async function ensureUserRow(
  supabase: NonNullable<SupabaseClient>,
  user: AuthedUser
): Promise<void> {
  await safeUpsert(
    supabase,
    'users',
    {
      id: user.id,
      identifier: user.id,
      email: user.email || null,
      full_name:
        ((user.user_metadata as Record<string, unknown> | null)?.full_name as string | undefined) || null,
      role: 'customer',
      created_at: Date.now(),
    },
    'id'
  );
}

/**
 * Wraps `supabase.from(table).upsert(payload, { onConflict })` so callers
 * can tolerate both "no such table" and "no such column" errors without
 * having to embed the same regex inspection everywhere. Returns true when
 * the row was actually written (or already existed); false when the table
 * itself is absent or the column set is incompatible.
 */
async function safeUpsert(
  supabase: NonNullable<SupabaseClient>,
  table: 'users' | 'profiles',
  payload: Record<string, unknown>,
  conflictTarget: string
): Promise<boolean> {
  // 1. SELECT first — if a row already exists with the PK, the upsert is
  // a no-op for THIS upload but we still avoid the INSERT path entirely
  // (saves a round trip and lets us tolerate strict-mode legacy columns).
  const { data: existing, error: readErr } = await supabase
    .from(table)
    .select('id')
    .eq('id', payload.id as string)
    .maybeSingle();
  // `readErr` is non-null in two practical cases: the table doesn't exist
  // (42P01) or a referenced column/relation is missing. Both are tolerated.
  if (readErr) return false;
  if (existing?.id) return true;

  const { error: upsertErr } = await supabase
    .from(table)
    .upsert(payload, { onConflict: conflictTarget, ignoreDuplicates: false });

  if (upsertErr) {
    // Duplicate key = a parallel request raced us into the row; that's
    // a quiet win. "table not found" / "column not found" / schema-cache
    // races = not a fatal error for the upload itself. The downstream
    // INSERT will surface a real failure when the row actually never
    // lands. We log only the unexpected cases so a regression is debuggable.
    const msg = upsertErr.message || '';
    if (!/duplicate key/i.test(msg)) {
      // Use console.warn rather than throw — if the FK is genuinely
      // satisfied by the OTHER table (e.g. documents.user_id actually
      // references `profiles(id)`), this is a non-event. The downstream
      // INSERT is the source of truth.
      console.warn(`[documents] ${table} upsert skipped:`, msg);
    }
    return false;
  }
  return true;
}

/**
 * Compresses a picked file to the brief's 4-20 KB band and uploads it
 * DIRECTLY to Supabase Storage + INSERTs the documents row.
 *
 * STRATEGY (revised 2026-09-01, third pass):
 *
 *   The customer-facing upload flow no longer touches `/api/documents/upload`
 *   at all. The previous Express route was at risk of Vercel's 10 s
 *   serverless-function ceiling whenever Cloudinary was slow (Vercel killed
 *   the connection → `Request aborted` toast), and even after we made the
 *   CDN replication fire-and-forget there was still a working network
 *   round-trip through the bridge. Skipping it entirely:
 *
 *   1. `compressDocument` in the browser (the file is already a few KB).
 *   2. `supabase.storage.from('documents').upload(...)` directly to
 *      Supabase Storage at `<authUid>/<timestamp>.<ext>`. The bucket is
 *      public and the INSERT/UPDATE/DELETE RLS policies enforce
 *      owner-scoped access on storage.objects.
 *   3. `supabase.from('documents').insert(...)` — the four owner-scoped
 *      RLS policies on `public.documents` (added in the latest
 *      `storage_documents.sql` migration) admit the INSERT.
 *   4. Best-effort audit entry via `POST /api/customer/activity-log`
 *      (separate route, fire-and-forget so it cannot block the upload).
 *
 * Returns the persisted record plus the compression result. The caller can
 * listen to progress via options.onProgress.
 *
 * NOTE: the function has NO fallback to `/api/documents/upload`. If the
 * direct Supabase path fails, we throw — the front-end renders an honest
 * error toast, instead of silently doubling the network traffic.
 */
export async function uploadCompressedDocument(
  file: File,
  documentType: DocumentType,
  options: { token?: string | null; onProgress?: (percent: number) => void } = {}
): Promise<{ record: CustomerDocument; compressed: CompressedDocument }> {
  // Compress first so the network payload is small and the round-trip
  // fits well inside a single Supabase Storage PUT.
  const compressed = await compressDocument(file, { onProgress: options.onProgress });
  options.onProgress?.(50);

  // Direct Supabase path — the only path. Compression is done; the bytes
  // fit the bucket's 5 MB cap with orders of magnitude to spare.
  const direct = await uploadDocumentDirect(file, documentType, {
    onProgress: (pct) => options.onProgress?.(Math.max(50, pct)),
  });
  options.onProgress?.(95);

  // Best-effort audit log entry — fire-and-forget so the customer's UI
  // experience is never blocked on the server. `keepalive: true` lets
  // the request survive even if the user navigates away immediately
  // after picking the file.
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
  return { record: { ...direct.record, source: 'direct' }, compressed };
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
