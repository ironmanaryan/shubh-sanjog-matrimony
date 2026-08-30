import Link from 'next/link';
import { Mail, MapPin, Phone, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

// Shared business details used across every legal & static page.
export const BUREAU = {
  name: 'Shubh Sanjog Marriage Bureau',
  brand: 'Shubh Sanjog Matrimony',
  phone: '+91 9034850873',
  phoneHref: 'tel:+919034850873',
  email: 'shubhsanjogmarriagebureau@gmail.com',
  emailHref: 'mailto:shubhsanjogmarriagebureau@gmail.com',
  location: 'Fatehabad, Haryana, India',
  lastUpdated: '22 August 2026',
};

const LEGAL_LINKS = [
  { label: 'Terms & Conditions', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Frequently Asked Questions', href: '/faq' },
];

// Common page frame for legal / static content pages. The root layout already
// provides the site header + footer; this adds the page hero, contact strip,
// and a consistent reading column.
export default function LegalShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-[#fffaf8] text-[#2c0d16]">
      <section className="border-b border-[#f2d8a8]/70 bg-[radial-gradient(circle_at_top_left,_rgba(212,166,74,0.14),_transparent_30%),linear-gradient(180deg,#fffaf8_0%,#fff_100%)]">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#e8d39a] bg-white px-4 py-1.5 text-xs font-bold uppercase tracking-[0.28em] text-[#7b102d] shadow-soft">
            <ShieldCheck size={13} className="text-[#c38e18]" />
            Legal
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.02] tracking-[-0.04em] sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-[#5a3743]">{description}</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#9b7d5f]">Last updated: {BUREAU.lastUpdated}</p>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <a href={BUREAU.phoneHref} className="card-hover flex items-center gap-3 rounded-2xl border border-[#f2d8a8] bg-white px-4 py-3 shadow-soft">
              <Phone size={16} className="shrink-0 text-[#b88b24]" />
              <span className="text-sm font-semibold">{BUREAU.phone}</span>
            </a>
            <a href={BUREAU.emailHref} className="card-hover flex items-center gap-3 rounded-2xl border border-[#f2d8a8] bg-white px-4 py-3 shadow-soft">
              <Mail size={16} className="shrink-0 text-[#b88b24]" />
              <span className="truncate text-sm font-semibold">{BUREAU.email}</span>
            </a>
            <div className="flex items-center gap-3 rounded-2xl border border-[#f2d8a8] bg-white px-4 py-3 shadow-soft">
              <MapPin size={16} className="shrink-0 text-[#b88b24]" />
              <span className="text-sm font-semibold">{BUREAU.location}</span>
            </div>
          </div>
        </div>
      </section>

      <article className="mx-auto max-w-4xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">{children}</article>

      <section className="mx-auto max-w-4xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-[#f2d9a8] bg-white p-6 shadow-soft">
          <h2 className="text-lg font-black">Related policies</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-full border border-[#e5c88d] bg-[#fffaf0] px-4 py-2 text-sm font-semibold text-[#7b102d] transition hover:bg-[#fff3dd]">
                {link.label}
              </Link>
            ))}
          </div>
          <p className="mt-5 text-sm leading-7 text-[#5a3743]">
            Questions about this policy? Call us at {BUREAU.phone}, email {BUREAU.email}, or visit our office in {BUREAU.location}.
          </p>
        </div>
      </section>
    </div>
  );
}

export function LegalSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-[24px] border border-[#f2e3bd] bg-white p-6 shadow-soft sm:p-8">
      <h2 className="text-xl font-black tracking-tight text-[#7b102d]">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-7 text-[#4a2a35]">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#d4a64a]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
