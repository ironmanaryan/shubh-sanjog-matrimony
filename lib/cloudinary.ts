// Cloudinary configuration for Shubh Sanjog Matrimony
// Handles all profile photo uploads with automatic optimization and face alignment.
// Credentials from .env.local: NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=dbubvqtbc
// Server-only secrets: CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

import { v2 as cloudinary } from 'cloudinary';

const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dbubvqtbc';
const apiKey = process.env.CLOUDINARY_API_KEY || '974713569556781';
const apiSecret = process.env.CLOUDINARY_API_SECRET || 'UpG3t9mAftah_QQhqZfpisil-uA';

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

export const isCloudinaryConfigured = (): boolean => {
  return Boolean(cloudName && apiKey && apiSecret);
};

export interface CloudinaryUploadResult {
  secure_url: string;
  url: string;
  public_id: string;
  format: string;
  width: number;
  height: number;
  resource_type: string;
}

/**
 * Upload a profile photo to Cloudinary with automatic optimization and face alignment.
 * Applies: format:auto (WebP/AVIF), quality:auto, gravity:face, crop:fill/thumb
 */
export async function uploadProfilePhoto(
  filePath: string,
  folder: string = 'shubh-sanjog/profiles',
  options: { crop?: 'fill' | 'thumb'; width?: number; height?: number } = {}
): Promise<CloudinaryUploadResult | null> {
  if (!isCloudinaryConfigured()) {
    console.warn('[cloudinary] not configured, skipping upload');
    return null;
  }
  if (!filePath) return null;

  const { crop = 'fill', width = 500, height = 500 } = options;

  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: 'image',
      // Automatic image optimization and face alignment
      format: 'auto',
      quality: 'auto',
      gravity: 'face',
      crop,
      width,
      height,
      fetch_format: 'auto',
      flags: 'progressive',
      // Additional transformations for avatar optimization
      transformation: [
        {
          width,
          height,
          crop,
          gravity: 'face',
          quality: 'auto',
          fetch_format: 'auto',
        },
      ],
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    });

    return {
      secure_url: result.secure_url,
      url: result.url,
      public_id: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
      resource_type: result.resource_type,
    };
  } catch (err) {
    console.warn('[cloudinary] upload failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Generate an optimized Cloudinary URL with face-alignment transformations
 * for existing public_id. Useful for rendering avatars with auto format/quality.
 */
export function getOptimizedAvatarUrl(
  publicIdOrUrl: string,
  options: { width?: number; height?: number; crop?: 'fill' | 'thumb' } = {}
): string | null {
  if (!publicIdOrUrl) return null;
  if (publicIdOrUrl.startsWith('http')) {
    // If already a URL, inject transformations via cloudinary url helper if possible
    // Otherwise return as-is (already optimized)
    try {
      const url = new URL(publicIdOrUrl);
      if (url.hostname.includes('res.cloudinary.com')) {
        // Already a Cloudinary URL - return as is (transformations already applied on upload)
        return publicIdOrUrl;
      }
      return publicIdOrUrl;
    } catch {
      return publicIdOrUrl;
    }
  }

  if (!isCloudinaryConfigured()) return null;

  const { width = 300, height = 300, crop = 'thumb' } = options;
  try {
    return cloudinary.url(publicIdOrUrl, {
      secure: true,
      width,
      height,
      crop,
      gravity: 'face',
      quality: 'auto',
      fetch_format: 'auto',
      flags: 'progressive',
    });
  } catch {
    return null;
  }
}

export { cloudinary };
