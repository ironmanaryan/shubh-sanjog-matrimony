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
