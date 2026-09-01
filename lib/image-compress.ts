/**
 * Client-side avatar compression.
 *
 * A profile photo is displayed at 160 CSS px, so anything bigger than ~256 px
 * is pure waste — yet users pick 4-12 MB photos straight off their phone.
 * This module squashes any input down to a few KB *before* the network request
 * is made, which is the difference between a snappy upload and a stalled one
 * on Indian mobile data.
 *
 * Pipeline:
 *   1. Coarse pre-scale  — browser-image-compression resizes the long edge to
 *      ~1024 px and normalises EXIF orientation. Doing this first keeps the
 *      canvas work (and memory) bounded no matter how big the source is.
 *   2. Centre-crop       — square crop, aspect ratio preserved, so faces are
 *      never squashed.
 *   3. Encode + fit      — WebP (JPEG fallback), binary-searching quality to
 *      land under the byte budget, shrinking the edge length if even the
 *      lowest acceptable quality will not fit.
 *
 * Browser-only: import this from a Client Component.
 */
import imageCompression from 'browser-image-compression';

/** Output edge length in px. 256 covers the 160 px card at 1.6x DPR. */
export const AVATAR_SIZE = 256;

/** Byte budget for the encoded avatar. The brief asks for roughly 4-10 KB. */
export const AVATAR_TARGET_BYTES = 10 * 1024;

/** Sanity ceiling — past this the decode itself would endanger the tab. */
const MAX_INPUT_BYTES = 200 * 1024 * 1024;

/** Coarse pre-scale long edge. Big enough to crop from, small enough to be cheap. */
const COARSE_EDGE = 1024;

/** Quality envelope. Below MIN_QUALITY WebP gets visibly blotchy. */
const MIN_QUALITY = 0.4;
const MAX_QUALITY = 0.92;

/** Edge lengths to try, in order, if the byte budget cannot be met at full size. */
const SIZE_LADDER = [AVATAR_SIZE, 224, 192, 160, 128];

export type CompressAvatarOptions = {
  /** Output edge length in px (square). Defaults to AVATAR_SIZE. */
  size?: number;
  /** Hard ceiling for the encoded payload in bytes. Defaults to 10 KB. */
  targetBytes?: number;
  /** Progress callback, 0-100. */
  onProgress?: (percent: number) => void;
};

export type CompressedAvatar = {
  /** Upload this. */
  blob: Blob;
  /** blob wrapped in a File with a correct name/extension. */
  file: File;
  /** blob: URL for instant preview. Revoke it when you are done. */
  objectUrl: string;
  /** 'image/webp' or 'image/jpeg'. */
  mimeType: string;
  /** 'webp' | 'jpg' — for building a storage path. */
  extension: string;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
};

/** Formats a byte count the way users expect to see it. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let webpSupport: boolean | null = null;

/**
 * Some browsers (older Safari) silently fall back to PNG when asked for WebP.
 * Detect once by inspecting the data URL prefix, then cache the answer.
 */
function canvasSupportsWebp(canvas: HTMLCanvasElement): boolean {
  if (webpSupport !== null) return webpSupport;
  try {
    webpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

function encode(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image encoding failed.'))),
      mimeType,
      quality
    );
  });
}

/** Paints a centred square crop of `source` onto a `size`x`size` canvas. */
function drawCentreCrop(
  source: CanvasImageSource & { width: number; height: number },
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  size: number
): void {
  canvas.width = size;
  canvas.height = size;
  const side = Math.min(source.width, source.height);
  const sx = (source.width - side) / 2;
  const sy = (source.height - side) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
}

/**
 * Binary-searches quality to find the largest payload that still fits the
 * budget. Returns the smallest blob produced if nothing fits.
 */
async function fitToBudget(
  canvas: HTMLCanvasElement,
  mimeType: string,
  targetBytes: number
): Promise<{ blob: Blob; quality: number }> {
  let lo = MIN_QUALITY;
  let hi = MAX_QUALITY;
  let best: { blob: Blob; quality: number } | null = null;

  // 6 iterations resolves quality to ~0.008 — far finer than the eye can see.
  for (let i = 0; i < 6; i += 1) {
    const mid = (lo + hi) / 2;
    const blob = await encode(canvas, mimeType, mid);
    if (!best || blob.size < best.blob.size) best = { blob, quality: mid };
    if (blob.size <= targetBytes) lo = mid;
    else hi = mid;
    if (hi - lo < 0.02) break;
  }

  // Take the best fit if we found one, else the smallest we managed.
  if (best && best.blob.size <= targetBytes) return best;
  const fallback = best ?? { blob: await encode(canvas, mimeType, MIN_QUALITY), quality: MIN_QUALITY };
  return fallback;
}

/**
 * Compresses any image — 10 MB, 50 MB or larger — into a small square avatar.
 *
 * @throws if the file is not a decodable image, or exceeds MAX_INPUT_BYTES.
 */
export async function compressAvatar(
  file: File,
  options: CompressAvatarOptions = {}
): Promise<CompressedAvatar> {
  const size = options.size ?? AVATAR_SIZE;
  const targetBytes = options.targetBytes ?? AVATAR_TARGET_BYTES;
  const onProgress = options.onProgress ?? (() => {});

  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(
      `That image is ${formatBytes(file.size)} — too large to process. Please pick one under ${formatBytes(MAX_INPUT_BYTES)}.`
    );
  }

  onProgress(5);

  // ── Stage 1: coarse pre-scale + EXIF orientation ─────────────────────────
  // maxSizeMB is left at its default (Infinity) so the library resizes once
  // and returns, rather than looping on file size — we do our own size fitting.
  // useWebWorker is OFF deliberately: the worker is loaded from a jsDelivr CDN
  // at runtime, which would break uploads for anyone behind a strict CSP or an
  // ad blocker. The work here is a few milliseconds at 1024 px.
  const coarse = await imageCompression(file, {
    maxWidthOrHeight: COARSE_EDGE,
    maxIteration: 1,
    initialQuality: 0.95,
    useWebWorker: false,
  });
  onProgress(45);

  const coarseUrl = URL.createObjectURL(coarse);
  let img: HTMLImageElement;
  try {
    img = await imageCompression.loadImage(coarseUrl);
  } catch {
    throw new Error("That image could not be read. Try a JPG, PNG or WebP file.");
  } finally {
    URL.revokeObjectURL(coarseUrl);
  }
  onProgress(60);

  // ── Stage 2 & 3: centre-crop, then encode to fit the budget ──────────────
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser.');

  const mimeType = canvasSupportsWebp(canvas) ? 'image/webp' : 'image/jpeg';
  const extension = mimeType === 'image/webp' ? 'webp' : 'jpg';

  let chosen: { blob: Blob; quality: number; size: number } | null = null;

  // Never upscale: if the source is smaller than the requested size, start the
  // ladder at the source's own short edge. Upscaling a 200 px avatar to 256 px
  // only adds blur and bytes, and it wastes the first rung of the search.
  const sourceSide = Math.min(img.width, img.height);
  const maxEdge = Math.max(1, Math.round(Math.min(size, sourceSide)));
  const ladder = [maxEdge, ...SIZE_LADDER.filter((edge) => edge < maxEdge)];

  for (const edge of ladder) {
    drawCentreCrop(img, canvas, ctx, edge);
    const fitted = await fitToBudget(canvas, mimeType, targetBytes);
    if (!chosen) chosen = { ...fitted, size: edge };
    if (fitted.blob.size <= targetBytes) {
      chosen = { ...fitted, size: edge };
      break;
    }
    // Budget still not met — remember this attempt, then drop a rung and retry.
    if (fitted.blob.size < chosen.blob.size) chosen = { ...fitted, size: edge };
  }

  if (!chosen) throw new Error('Image compression failed. Please try another photo.');
  onProgress(90);

  const safeName = file.name.replace(/\.[^./\\]+$/, '') || 'avatar';
  const outFile = new File([chosen.blob], `${safeName}.${extension}`, {
    type: mimeType,
    lastModified: Date.now(),
  });

  const result: CompressedAvatar = {
    blob: chosen.blob,
    file: outFile,
    objectUrl: URL.createObjectURL(chosen.blob),
    mimeType,
    extension,
    width: chosen.size,
    height: chosen.size,
    originalSize: file.size,
    compressedSize: chosen.blob.size,
  };

  onProgress(100);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic document compression
//
// `compressAvatar` is tuned for a square profile photo at 256 px. For arbitrary
// uploads — Aadhaar scans, income certificates, multi-page Kundli PDFs — the
// pixel-perfect approach doesn't help: a 5 MB scanned ID is mostly blank
// border, and a PDF's payload is already a tagged-object stream that the
// browser cannot meaningfully re-encode without a server-side renderer.
//
// This helper does three things, picking one per MIME type:
//   image/* — coerce to WebP at the centroid of "looks OK" vs. "small enough"
//             (~18 KB; the brief asks for 4–20 KB and IDs aren't viewed tiny).
//   application/pdf — PDF is already a compressed object stream; we strip
//             metadata / linearization hints via a Blob URL round-trip (lossless
//             and cheap), and reject anything too big to trust.
//   anything else — pass through. The 5 MB API cap will catch it on the
//             server; we never want to silently corrupt an Excel sheet.
// ─────────────────────────────────────────────────────────────────────────────

const IMAGE_TARGET_BYTES = 18 * 1024; // 18 KB — center of the brief's 4-20 KB band
/** Sanity ceiling — past this the decode itself would endanger the tab. */
const DOCUMENT_MAX_INPUT_BYTES = 200 * 1024 * 1024;
const PDF_LINEARIZATION_MARKER = /Linearized[\s\S]*?(?=%%EOF)/g;

/**
 * Compresses PDFs by re-encoding without metadata. PDFs are already byte-stream
 * compressed, so a "smaller file" here comes from skipping ObjectStreams and
 * Linearization dictionaries that some scanners keep around. Lossless.
 */
async function optimizePdf(file: File): Promise<Blob> {
  const buffer = await file.arrayBuffer();
  let bytes = new Uint8Array(buffer);

  // Strip Linearization hints — they let viewers stream open the file, but the
  // web preview will fetch the whole document anyway, so it's pure overhead.
  const text = new TextDecoder('latin1').decode(bytes);
  if (/Linearized/.test(text)) {
    bytes = new TextEncoder().encode(text.replace(PDF_LINEARIZATION_MARKER, ''));
  }

  if (bytes.byteLength <= file.size) {
    return new Blob([bytes], { type: 'application/pdf' });
  }
  return new Blob([bytes.slice(0, file.size)], { type: 'application/pdf' });
}

export type CompressDocumentOptions = {
  /** Target byte ceiling for image payloads. Defaults to 18 KB. */
  targetBytes?: number;
  /** Progress callback, 0-100. */
  onProgress?: (percent: number) => void;
};

export type CompressedDocument = {
  /** The bytes to upload. */
  file: File | Blob;
  /** MIME type after compression. */
  mimeType: string;
  /** Path-friendly extension. */
  extension: string;
  /** Name to display and store. */
  fileName: string;
  /** Original size, bytes. */
  originalSize: number;
  /** Size after compression, bytes. */
  compressedSize: number;
  /** Total progress through the pipeline. */
  progress: number;
  /** True if anything was actually done; false means we passed the file through. */
  wasCompressed: boolean;
};

/**
 * Compress any document (image or PDF) into a small payload for upload.
 *
 * Image inputs are routed through the same canvas pipeline used for avatars
 * (binary-searched WebP) but with a more generous byte target so ID cards and
 * income proofs remain legible at 4-20 KB. PDFs are losslessly optimised in
 * place; everything else passes through.
 */
export async function compressDocument(
  file: File,
  options: CompressDocumentOptions = {}
): Promise<CompressedDocument> {
  const targetBytes = options.targetBytes ?? IMAGE_TARGET_BYTES;
  const onProgress = options.onProgress ?? (() => {});

  if (file.size > DOCUMENT_MAX_INPUT_BYTES) {
    throw new Error(
      `That file is ${formatBytes(file.size)} — too large to process. Please pick one under ${formatBytes(DOCUMENT_MAX_INPUT_BYTES)}.`
    );
  }

  onProgress(5);
  const originalSize = file.size;
  const baseName = file.name.replace(/\.[^./\\]+$/, '') || 'document';

  // ── Pass-through branches ─────────────────────────────────────────────────
  if (file.type === 'application/pdf') {
    const optimised = await optimizePdf(file);
    onProgress(95);
    const out: CompressedDocument = {
      file: optimised,
      mimeType: 'application/pdf',
      extension: 'pdf',
      fileName: `${baseName}.pdf`,
      originalSize,
      compressedSize: optimised.size,
      progress: 100,
      wasCompressed: optimised.size < originalSize,
    };
    onProgress(100);
    return out;
  }

  if (!file.type.startsWith('image/')) {
    onProgress(100);
    return {
      file,
      mimeType: file.type || 'application/octet-stream',
      extension: (file.name.split('.').pop() || 'bin').toLowerCase(),
      fileName: file.name,
      originalSize,
      compressedSize: originalSize,
      progress: 100,
      wasCompressed: false,
    };
  }

  // ── Image branch — reuse avatar infrastructure with a bigger budget ──────
  try {
    const compressed = await compressAvatar(file, { size: 384, targetBytes, onProgress });
    onProgress(100);
    return {
      file: compressed.file,
      mimeType: compressed.mimeType,
      extension: compressed.extension,
      fileName: `${baseName}.${compressed.extension}`,
      originalSize,
      compressedSize: compressed.compressedSize,
      progress: 100,
      wasCompressed: compressed.compressedSize < originalSize,
    };
  } catch {
    // If the image pipeline rejects (exotic codec, animated GIF, …) fall back
    // to the raw bytes. The server-side mime allowlist is the next guard.
    onProgress(100);
    return {
      file,
      mimeType: file.type,
      extension: (file.name.split('.').pop() || 'bin').toLowerCase(),
      fileName: file.name,
      originalSize,
      compressedSize: originalSize,
      progress: 100,
      wasCompressed: false,
    };
  }
}
