'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getSession } from '@/lib/auth-client';
import { buildProfileHelpMessage, buildWidgetMessage, waLink } from '@/lib/whatsapp';

// WhatsApp brand glyph (lucide has no brand icons)
export function WhatsAppGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91A9.85 9.85 0 0 0 12.04 2Zm5.8 14.06c-.24.68-1.41 1.3-1.94 1.35-.53.05-1.03.24-2.92-.61-2.27-1.02-3.7-3.4-3.81-3.56-.11-.16-.91-1.26-.87-2.39.04-1.13.63-1.67.85-1.9.22-.23.48-.28.64-.28.16 0 .32 0 .46.01.15.01.35-.06.54.44.19.5.66 1.73.72 1.86.06.13.09.28.01.44-.08.16-.17.32-.33.5-.16.18-.34.4-.19.66.15.26.67 1.16 1.43 1.88.98.93 1.79 1.23 2.05 1.37.26.14.42.12.58-.05.16-.17.68-.74.86-1 .18-.26.36-.21.6-.12.24.09 1.53.76 1.79.9.26.14.44.2.5.31.06.11.06.65-.18 1.29Z" />
    </svg>
  );
}

// Context derived from the current route so the pre-filled text matches what
// the member is doing when they tapped the widget.
function contextForPath(pathname: string | null): string | null {
  if (!pathname) return null;
  if (pathname.startsWith('/customer/membership')) return 'my membership plan or payment';
  if (pathname.startsWith('/customer/appointments')) return 'booking a consultation';
  if (pathname.startsWith('/customer/documents')) return 'uploading my documents or kundli';
  if (pathname.startsWith('/customer/biodata')) return 'completing my biodata';
  if (pathname.startsWith('/customer/recommended')) return 'my recommended matches';
  if (pathname.startsWith('/customer')) return 'my matrimonial profile';
  if (pathname.startsWith('/plans')) return 'your plans and pricing';
  return null;
}

/**
 * Floating WhatsApp chat widget — fixed bottom-right, site-wide (PRD #2).
 * Opens wa.me with a pre-filled message that names the member and reflects the
 * page they came from.
 */
export default function FloatingWhatsApp() {
  const pathname = usePathname();
  const [href, setHref] = useState(() => waLink(buildWidgetMessage()));

  useEffect(() => {
    const { user } = getSession();
    setHref(waLink(buildWidgetMessage(user?.fullName || user?.identifier, contextForPath(pathname))));
  }, [pathname]);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      title="Chat with us on WhatsApp"
      className="group fixed bottom-6 right-6 z-40 inline-flex items-center gap-2.5 rounded-full bg-[#25D366] py-3.5 pl-4 pr-4 text-sm font-bold text-white shadow-xl shadow-[#25D366]/30 transition-all duration-200 hover:scale-[1.03] hover:bg-[#1fbf5b] sm:pr-5"
    >
      <WhatsAppGlyph className="h-6 w-6 shrink-0" />
      <span className="hidden sm:inline">Chat with us</span>
    </a>
  );
}
