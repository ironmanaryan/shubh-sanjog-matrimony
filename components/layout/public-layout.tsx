'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Menu, X, Phone, MapPin, ShieldCheck, ChevronDown, UserRound, HelpCircle, FileText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import FloatingWhatsApp from '@/components/layout/FloatingWhatsApp';
import WhatsAppIcon from '@/components/ui/whatsapp-icon';
import AuthButtons from '@/components/auth/AuthButtons';

// ─── Developer credit (footer) ───────────────────────────────────────────────
// Modular toggle: set `enabled` to false to hide the credit site-wide without
// touching any markup. `name`/`url` can be adjusted independently later.
const DEVELOPER_CREDIT = {
  enabled: true,
  label: 'Designed and Developed By',
  company: 'ZORVENT',
  url: 'https://zorvent.com',
};

const navItems = [
  { label: 'Home', href: '/' },
  { label: 'About Us', href: '/about' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Membership Plans', href: '/plans' },
  { label: 'Consultation', href: '/consultation' },
  { label: 'Contact Us', href: '/contact' },
];

// "More" dropdown — help & legal pages.
const moreLinks = [
  { label: 'FAQ', href: '/faq', icon: HelpCircle },
  { label: 'Privacy Policy', href: '/privacy', icon: ShieldCheck },
  { label: 'Terms & Conditions', href: '/terms', icon: FileText },
];

const viewLinks = [
  { label: 'Customer View', href: '/customer' },
  { label: 'Admin View', href: '/admin' },
];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const viewsRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);

  // Close any open header dropdown on outside click or Escape.
  useEffect(() => {
    if (!viewsOpen && !moreOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (viewsRef.current?.contains(event.target) || moreRef.current?.contains(event.target)) return;
      setViewsOpen(false);
      setMoreOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setViewsOpen(false);
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [viewsOpen, moreOpen]);

  // Lock body scroll and support Escape while the mobile drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    const focusTimer = window.setTimeout(() => drawerCloseRef.current?.focus(), 60);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [mobileOpen]);

  // Reset drawer state when resizing up to desktop.
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)');
    const handleChange = () => {
      if (media.matches) {
        setMobileOpen(false);
        setMoreOpen(false);
      }
    };
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  return (
    <div className="min-h-screen bg-[#fffaf8] text-[#2c0d16]">
      <header className="sticky top-0 z-50 border-b border-rose-100 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/80 will-change-transform">
        <div className="mx-auto flex h-16 items-center gap-4 px-4 sm:h-[72px] sm:px-6 lg:h-[76px] lg:gap-6 lg:px-8">
          {/* Brand */}
          <div className="flex flex-1 justify-start">
            <Link href="/" aria-label="Shubh Sanjog Matrimony home" className="group flex shrink-0 items-center gap-3">
              <Image
                src="/logo.png"
                alt="Shubh Sanjog Matrimony"
                width={48}
                height={48}
                priority
                className="h-10 w-10 shrink-0 rounded-full object-contain shadow-md shadow-[#7b102d]/25 ring-1 ring-[#7b102d]/15 transition-transform duration-300 group-hover:scale-105 sm:h-11 sm:w-11"
              />
              <span className="leading-none">
                <span className="font-display block whitespace-nowrap text-xl tracking-tight text-[#2c0d16] sm:text-2xl">Shubh Sanjog</span>
                <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.3em] text-[#7b102d]/70">Matrimony</span>
              </span>
            </Link>
          </div>

          {/* Center navigation links */}
          <nav aria-label="Primary" className="hidden items-center gap-5 xl:flex 2xl:gap-7">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="whitespace-nowrap text-sm font-medium text-[#4a2a35] transition-colors duration-200 hover:text-[#800020]"
              >
                {item.label}
              </Link>
            ))}

            {/* Help / legal pages dropdown */}
            <div ref={moreRef} className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                onClick={() => {
                  setMoreOpen((open) => !open);
                  setViewsOpen(false);
                }}
                className="flex items-center gap-1 whitespace-nowrap text-sm font-medium text-[#4a2a35] transition-colors duration-200 hover:text-[#800020]"
              >
                More
                <ChevronDown size={14} className={`transition-transform duration-200 ${moreOpen ? 'rotate-180' : ''}`} />
              </button>

              {moreOpen && (
                <div role="menu" aria-label="More information" className="absolute left-1/2 top-full mt-3 w-64 -translate-x-1/2 overflow-hidden rounded-2xl border border-rose-100 bg-white p-1.5 shadow-xl shadow-[#2c0d16]/10">
                  {moreLinks.map(({ label, href, icon: Icon }) => (
                    <Link
                      key={href}
                      role="menuitem"
                      href={href}
                      onClick={() => setMoreOpen(false)}
                      className="flex items-start gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium text-[#4a2a35] transition-colors duration-150 hover:bg-rose-50 hover:text-[#800020]"
                    >
                      <Icon size={15} className="mt-0.5 shrink-0 text-[#b08a95]" />
                      <span className="leading-snug">{label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>

          {/* Right CTA group */}
          <div className="flex flex-1 items-center justify-end gap-2.5">
            {/* Secondary demo/demo views dropdown (kept out of the primary CTAs) */}
            <div ref={viewsRef} className="relative hidden xl:block">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={viewsOpen}
                onClick={() => {
                  setViewsOpen((open) => !open);
                  setMoreOpen(false);
                }}
                className="flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-2 text-sm font-medium text-[#8a6a75] transition-colors duration-200 hover:text-[#800020]"
              >
                Views
                <ChevronDown size={14} className={`transition-transform duration-200 ${viewsOpen ? 'rotate-180' : ''}`} />
              </button>

              {viewsOpen && (
                <div role="menu" aria-label="Quick views" className="absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-2xl border border-rose-100 bg-white p-1.5 shadow-xl shadow-[#2c0d16]/10">
                  <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#b08a95]">Demo access</p>
                  <Link
                    role="menuitem"
                    href="/customer"
                    onClick={() => setViewsOpen(false)}
                    className="flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium text-[#4a2a35] transition-colors duration-150 hover:bg-rose-50 hover:text-[#800020]"
                  >
                    <UserRound size={15} className="text-[#b08a95]" />
                    Customer View
                  </Link>
                  <Link
                    role="menuitem"
                    href="/admin"
                    onClick={() => setViewsOpen(false)}
                    className="flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium text-[#4a2a35] transition-colors duration-150 hover:bg-rose-50 hover:text-[#800020]"
                  >
                    <ShieldCheck size={15} className="text-[#b08a95]" />
                    Admin View
                  </Link>
                </div>
              )}
            </div>

            <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-rose-100 xl:block" />

            {/* Swaps between "Login / Registration" and the signed-in account
                menu. Driven by the Supabase session, so Google sign-in is
                reflected immediately instead of only after a hard reload. */}
            <AuthButtons variant="desktop" />

            {/* Hamburger trigger — 48px touch target */}
            <button
              type="button"
              aria-label="Open navigation menu"
              aria-controls="mobile-nav-drawer"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
              className="inline-flex h-12 w-12 shrink-0 touch-manipulation items-center justify-center rounded-full border border-rose-100 bg-white text-[#800020] shadow-sm transition-all duration-200 hover:border-[#800020]/30 hover:bg-rose-50 active:scale-95 xl:hidden"
            >
              <Menu size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer overlay */}
      <div
        aria-hidden="true"
        onClick={() => setMobileOpen(false)}
        className={`fixed inset-0 z-[60] bg-[#2c0d16]/45 backdrop-blur-sm transition-opacity duration-300 ease-out xl:hidden ${
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Mobile slide-out drawer — GPU-accelerated, 48px+ touch targets */}
      <aside
        id="mobile-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
        inert={!mobileOpen}
        className={`fixed inset-y-0 right-0 z-[70] flex w-[86%] max-w-[320px] flex-col bg-white shadow-2xl shadow-[#2c0d16]/25 will-change-transform transform-gpu transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] xl:hidden ${
          mobileOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-rose-100 px-5 py-4">
          <span className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="Shubh Sanjog Matrimony"
              width={48}
              height={48}
              className="h-9 w-9 rounded-full object-contain ring-1 ring-[#7b102d]/15"
            />
            <span className="leading-none">
              <span className="block text-base font-black tracking-tight text-[#2c0d16]">Shubh Sanjog</span>
              <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.28em] text-[#7b102d]/70">Matrimony</span>
            </span>
          </span>
          <button
            ref={drawerCloseRef}
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileOpen(false)}
            className="inline-flex h-12 w-12 touch-manipulation items-center justify-center rounded-full border border-rose-100 bg-white text-[#800020] shadow-sm transition-all duration-200 hover:bg-rose-50 active:scale-95"
          >
            <X size={18} />
          </button>
        </div>

        <nav aria-label="Mobile" className="flex flex-col gap-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className="flex min-h-[44px] touch-manipulation items-center rounded-xl px-4 py-3 text-[15px] font-medium text-[#4a2a35] transition-colors duration-150 hover:bg-rose-50 hover:text-[#800020] active:bg-rose-50"
            >
              {item.label}
            </Link>
          ))}

          {/* Collapsible Help / legal section */}
          <button
            type="button"
            aria-expanded={legalOpen}
            onClick={() => setLegalOpen((open) => !open)}
            className="mt-1 flex min-h-[44px] w-full touch-manipulation items-center justify-between rounded-xl px-4 py-3 text-[15px] font-medium text-[#4a2a35] transition-colors duration-150 hover:bg-rose-50 hover:text-[#800020] active:bg-rose-50"
          >
            More
            <ChevronDown size={16} className={`transition-transform duration-200 ${legalOpen ? 'rotate-180' : ''}`} />
          </button>
          {legalOpen && (
            <div className="ml-6 space-y-0.5 border-l border-rose-100 pl-2">
              {moreLinks.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium text-[#4a2a35] transition-colors duration-150 hover:bg-rose-50 hover:text-[#800020]"
                >
                  <Icon size={15} className="shrink-0 text-[#b08a95]" />
                  {label}
                </Link>
              ))}
            </div>
          )}
        </nav>

        <div className="mt-auto space-y-3 border-t border-rose-100 px-5 py-5">
          <AuthButtons variant="mobile" onNavigate={() => setMobileOpen(false)} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#b08a95]">Demo access</p>
            <div className="mt-2 flex items-center gap-4">
              {viewLinks.map((view) => (
                <Link
                  key={view.label}
                  href={view.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-sm font-medium text-[#8a6a75] underline-offset-4 transition-colors hover:text-[#800020] hover:underline"
                >
                  {view.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <main>{children}</main>

      {/* Floating WhatsApp chat widget — fixed bottom-right, site-wide.
          PRD high-priority #2: opens wa.me with a pre-filled, context-aware
          message (member name + the surface they are on). */}
      <FloatingWhatsApp />

      <footer className="mt-24 border-t border-[#f4d4a1] bg-[#fffdfb]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_0.8fr_0.8fr] lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Shubh Sanjog Matrimony"
                width={48}
                height={48}
                className="h-11 w-11 rounded-full object-contain shadow-sm ring-1 ring-[#7b102d]/15"
              />
              <div>
                <div className="text-xl font-black text-[#2c0d16]">Shubh Sanjog</div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.27em] text-[#9e6b00]">Matrimony</div>
              </div>
            </div>
            <p className="mt-5 max-w-md text-sm leading-7 text-[#5f3d49]">
              Bringing together families through thoughtful matchmaking, genuine compatibility, and a secure, respectful journey toward a meaningful lifelong partnership.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.25em] text-[#7b102d]">Contact</h3>
            <ul className="mt-5 space-y-4 text-sm text-[#5f3d49]">
              <li className="flex items-center gap-3">
                <Phone size={16} className="text-[#b88b24]" />
                <span>+91 9034850873</span>
              </li>
              <li className="flex items-center gap-3">
                <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
                <Link href="/contact" className="transition hover:text-[#7b102d]">Chat / Contact Us</Link>
              </li>
              <li className="flex items-center gap-3">
                <MapPin size={16} className="text-[#b88b24]" />
                <span>Fatehabad, Haryana, India</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.25em] text-[#7b102d]">Legal</h3>
            <ul className="mt-5 space-y-3 text-sm text-[#5f3d49]">
              <li><Link href="/privacy" className="transition hover:text-[#7b102d]">Privacy Policy</Link></li>
              <li><Link href="/terms" className="transition hover:text-[#7b102d]">Terms & Conditions</Link></li>
              <li><Link href="/terms#conduct" className="transition hover:text-[#7b102d]">Community Guidelines</Link></li>
              <li><Link href="/faq" className="transition hover:text-[#7b102d]">FAQ</Link></li>
              <li><Link href="/contact" className="transition hover:text-[#7b102d]">Contact Us</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[#f3d6a6] bg-[#fffaf6]">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-sm text-[#5f3d49] sm:flex-row sm:px-6 lg:px-8">
            <p>© 2026 Shubh Sanjog Matrimony. All rights reserved.</p>
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-[#b88b24]" />
              <span>Secure & trusted matchmaking</span>
            </div>
          </div>

          {/* Developer credit — centered bottom strip (modular: DEVELOPER_CREDIT toggle) */}
          {DEVELOPER_CREDIT.enabled && (
            <div className="border-t border-gray-100 py-4 text-center text-sm text-gray-600">
              {DEVELOPER_CREDIT.label}{' '}
              <a
                href={DEVELOPER_CREDIT.url}
                target="_blank"
                rel="noopener noreferrer"
                title={DEVELOPER_CREDIT.company}
                className="font-medium text-maroon-700 hover:underline"
              >
                {DEVELOPER_CREDIT.company}
              </a>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
