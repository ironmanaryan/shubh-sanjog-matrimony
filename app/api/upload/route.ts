import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary with env vars - ensures profile photo uploads use correct credentials
const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dbubvqtbc';
const apiKey = process.env.CLOUDINARY_API_KEY || '974713569556781';
const apiSecret = process.env.CLOUDINARY_API_SECRET || 'UpG3t9mAftah_QQhqZfpisil-uA';

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'shubh-sanjog/profiles';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!cloudName || !apiKey || !apiSecret) {
      return NextResponse.json({ error: 'Cloudinary not configured' }, { status: 500 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 });
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = `data:${file.type};base64,${buffer.toString('base64')}`;

    // Upload to Cloudinary with automatic optimization and face alignment
    // Transformations: format:auto (WebP/AVIF), quality:auto, gravity:face, crop:fill/thumb
    const result = await cloudinary.uploader.upload(base64, {
      folder,
      resource_type: 'image',
      use_filename: true,
      unique_filename: true,
      overwrite: false,
      // Automatic image optimization and face alignment
      format: 'auto',
      quality: 'auto',
      gravity: 'face',
      crop: 'fill',
      width: 500,
      height: 500,
      fetch_format: 'auto',
      flags: 'progressive',
      transformation: [
        {
          width: 500,
          height: 500,
          crop: 'fill',
          gravity: 'face',
          quality: 'auto',
          fetch_format: 'auto',
        },
      ],
    });

    return NextResponse.json(
      {
        success: true,
        secure_url: result.secure_url,
        url: result.url,
        public_id: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[api/upload] Cloudinary upload failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Cloudinary upload endpoint ready', cloudName }, { status: 200 });
}
