'use client';

import WhatsAppIcon from '@/components/ui/whatsapp-icon';
import { waLink } from '@/lib/whatsapp';

// PRD high-priority #2 — "Request Meeting" via WhatsApp with the slot/profile
// details pre-filled. Renders nothing when there is no message to send.
export default function RequestMeetingButton({ message, label = 'Request Meeting', className = '' }: { message: string; label?: string; className?: string }) {
  if (!message) return null;
  return (
    <a
      href={waLink(message)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} on WhatsApp`}
      title={`${label} on WhatsApp`}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-[#25D366]/50 bg-[#25D366]/10 px-4 py-2 text-sm font-bold text-[#128C4A] transition hover:bg-[#25D366] hover:text-white ${className}`}
    >
      <WhatsAppIcon className="h-4 w-4 shrink-0" />
      {label}
    </a>
  );
}
