/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Express API is mounted inside this app at app/api/[...path]/route.ts.
  // These packages must be required from node_modules at runtime rather than
  // bundled: `sqlite3` is a native addon, and the rest rely on dynamic
  // require() patterns that a bundler cannot statically resolve.
  serverExternalPackages: [
    'sqlite3',
    'sqlite',
    'express',
    'cors',
    'multer',
    'jsonwebtoken',
    'nodemailer',
    'cloudinary',
    'pg',
    'fs-extra',
    'dotenv',
    // NOTE: `uuid` is deliberately NOT listed. v14 is ESM-only, so keeping it
    // external makes `require('uuid')` throw at runtime — it must be bundled.
  ],
  images: {
    // Next.js 16 requires an explicit allowlist — `quality={85}` on the hero
    // <Image /> would otherwise log a config warning at render time.
    qualities: [60, 75, 85],
    // avif is the smallest; webp is the universal fallback. Browsers that
    // support neither fall back to jpeg. AVIF still renders ~30% smaller than
    // webp on the hero, which is the largest single asset on first paint.
    formats: ['image/avif', 'image/webp'],
    // Minimum cache TTL on the Vercel Image Optimization CDN. Match photos
    // and admin avatars are immutable so a long TTL is safe; this also
    // protects from re-encoding the same assets on every deploy.
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'images.pexels.com',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
};

export default nextConfig;
