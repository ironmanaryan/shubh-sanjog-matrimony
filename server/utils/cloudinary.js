// Cloudinary media gateway — routes all image/photo/PDF/document uploads through
// Cloudinary using .env.local vars:
//   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
// Falls back to local disk storage when not configured (so dev preview never breaks).

const cloudinary = require('cloudinary').v2;
const fs = require('fs');

let _configured = false;

function isCloudinaryConfigured() {
  return Boolean(
    (process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

function ensureConfigured() {
  if (_configured || !isCloudinaryConfigured()) return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  _configured = true;
}

/**
 * Upload a local file to Cloudinary. Returns { url, public_id, secure_url } or null when
 * Cloudinary is not configured (caller should keep local path).
 * `folder` prefixes the asset (e.g. "shubh-sanjog/documents").
 */
async function uploadToCloudinary(localPath, folder = 'shubh-sanjog') {
  if (!isCloudinaryConfigured()) return null;
  ensureConfigured();
  if (!localPath || !fs.existsSync(localPath)) return null;
  try {
    const result = await cloudinary.uploader.upload(localPath, {
      folder,
      resource_type: 'auto',
      use_filename: true,
      unique_filename: true,
      // Automatic image optimization and face alignment for profile photos
      format: 'auto',
      quality: 'auto',
      gravity: 'face',
      crop: folder.includes('profiles') || folder.includes('avatar') ? 'thumb' : 'fill',
      fetch_format: 'auto',
      flags: 'progressive',
      transformation: [
        {
          width: folder.includes('profiles') || folder.includes('avatar') ? 500 : 800,
          height: folder.includes('profiles') || folder.includes('avatar') ? 500 : 800,
          crop: folder.includes('profiles') || folder.includes('avatar') ? 'thumb' : 'fill',
          gravity: 'face',
          quality: 'auto',
          fetch_format: 'auto',
        },
      ],
    });
    // Optionally remove local temp file after successful cloud upload in production.
    // Keep it for now so existing DB paths remain valid as fallback.
    return {
      url: result.secure_url || result.url,
      public_id: result.public_id,
      secure_url: result.secure_url,
      resource_type: result.resource_type,
    };
  } catch (err) {
    console.warn('[cloudinary] upload failed, keeping local storage:', err.message);
    return null;
  }
}

function cloudinaryUrl(publicId, options = {}) {
  if (!isCloudinaryConfigured() || !publicId) return null;
  ensureConfigured();
  try {
    return cloudinary.url(publicId, { secure: true, ...options });
  } catch {
    return null;
  }
}

/**
 * Best-effort delete of a Cloudinary asset by public_id. Returns the API
 * result on success, throws on non-2xx so the caller can record the audit log
 * accurately. No-op when Cloudinary is not configured.
 */
async function deleteFromCloudinary(publicId) {
  if (!isCloudinaryConfigured() || !publicId) return null;
  ensureConfigured();
  const result = await cloudinary.uploader.destroy(publicId, { invalidate: true, resource_type: 'image' });
  return result;
}

module.exports = {
  cloudinary,
  isCloudinaryConfigured,
  uploadToCloudinary,
  deleteFromCloudinary,
  cloudinaryUrl,
};
