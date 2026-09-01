// Client-side document helpers: compression before upload, signed-URL download,
// and Delete. Wraps the lower-level /api/documents/* endpoints with the same
// auth-handling as `lib/api-client` and the proven blob:URL previews used for
// avatars. Browser-only: import from a Client Component.

import { compressDocument, formatBytes, type CompressedDocument } from '@/lib/image-compress';

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
};

/**
 * Compresses a picked file to the brief's 4-20 KB band and uploads it. Returns
 * the persisted record plus a friendly status string. The caller can listen
 * to progress via the options.onProgress.
 */
export async function uploadCompressedDocument(
  file: File,
  documentType: DocumentType,
  options: { token?: string | null; onProgress?: (percent: number) => void } = {}
): Promise<{ record: CustomerDocument; compressed: CompressedDocument }> {
  const token = options.token ?? (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
  if (!token) throw new Error('Login required');
  const compressed = await compressDocument(file, { onProgress: options.onProgress });

  const fd = new FormData();
  // Use the compressed blob with its real filename + mimetype so the server
  // sees the post-compression payload, not the raw picked file.
  const uploadBlob =
    compressed.file instanceof File
      ? compressed.file
      : new File([compressed.file], compressed.fileName, { type: compressed.mimeType });
  fd.append('file', uploadBlob);
  fd.append('documentType', documentType);

  const res = await fetch('/api/documents/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || json?.raw || 'Upload failed');
  }

  const f = json.file || json;
  const record: CustomerDocument = {
    id: f.id,
    name: f.originalName || compressed.fileName,
    uploadedAt: f.uploadedAt || Date.now(),
    status: f.status || 'Pending Review',
    documentType: f.documentType || documentType,
    rejectionReason: f.rejectionReason || null,
    size: f.size,
    mimetype: f.mimetype,
  };
  return { record, compressed };
}

function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Lists the signed-in user's documents (newest first). Returns an empty array
 * on network failure rather than throwing — dashboards stay online.
 */
export async function listCustomerDocuments(): Promise<CustomerDocument[]> {
  try {
    const res = await fetch('/api/documents', { headers: authHeaders() });
    if (!res.ok) return [];
    const json = await res.json();
    const docs = json.documents || [];
    return docs.map((d: any) => ({
      id: d.id,
      name: d.originalName,
      uploadedAt: d.uploadedAt,
      status: d.status,
      documentType: d.documentType || null,
      rejectionReason: d.rejectionReason || null,
      size: d.size,
      mimetype: d.mimetype,
    }));
  } catch {
    return [];
  }
}

/**
 * Delete a document. Server removes store row + cloud/local backing + DB row.
 * Audit-logged. Returns true on 2xx, false on a denied/retryable failure.
 */
export async function deleteCustomerDocument(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch a download URL the server has signed and trigger a browser download
 * to the user's machine. Equivalent to the historical "Download" button —
 * preserved here so the component file stays focused on UX.
 */
export async function downloadCustomerDocument(
  id: string,
  suggestedName: string
): Promise<boolean> {
  try {
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
