import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://shubh-sanjog-matrimony.vercel.app';
  const now = new Date();

  const routes: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }> = [
    // Public
    { path: '/', changeFrequency: 'daily', priority: 1.0 },
    { path: '/about', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/how-it-works', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/contact', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/consultation', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/faq', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/plans', changeFrequency: 'weekly', priority: 0.8 },
    // Auth
    { path: '/login', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/register', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/register/fill-details', changeFrequency: 'monthly', priority: 0.8 },
    // Customer (protected - requires login + is_completed)
    { path: '/customer', changeFrequency: 'weekly', priority: 0.9 },
    { path: '/customer/biodata', changeFrequency: 'weekly', priority: 0.7 },
    { path: '/customer/recommended', changeFrequency: 'daily', priority: 0.8 },
    { path: '/customer/membership', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/customer/appointments', changeFrequency: 'weekly', priority: 0.6 },
    { path: '/customer/documents', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/customer/activity', changeFrequency: 'weekly', priority: 0.5 },
    { path: '/customer/settings', changeFrequency: 'monthly', priority: 0.4 },
    { path: '/create-profile', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/checkout', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/members', changeFrequency: 'daily', priority: 0.8 },
    // Admin (protected - admin role)
    { path: '/admin', changeFrequency: 'weekly', priority: 0.5 },
    { path: '/admin/inquiries', changeFrequency: 'weekly', priority: 0.4 },
  ];

  return routes.map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
