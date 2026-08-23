// Shared WhatsApp deep-link helpers (PRD: high-priority #2).
//
// Every WhatsApp entry point in the app funnels through here so the bureau
// number stays consistent and every link carries a pre-filled message.

export const WHATSAPP_NUMBER = '919034850873';
export const WHATSAPP_DISPLAY = '+91 90348 50873';

/** https://wa.me/<number>?text=<url-encoded message> */
export function waLink(message?: string | null): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  const text = String(message || '').trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

const BUREAU = 'Shubh Sanjog Matrimony';

/** Generic widget greeting, personalised with the signed-in name when available. */
export function buildWidgetMessage(name?: string | null, context?: string | null): string {
  const who = name ? ` I'm ${name}.` : '';
  const about = context ? ` I need help with ${context}.` : ` I'd like to know more about your matchmaking services.`;
  return `Hello ${BUREAU}!${who}${about}`;
}

/** "Request Meeting" message for a consultation/appointment slot. */
export function buildMeetingRequestMessage(opts: {
  name?: string | null;
  date?: string | null;
  time?: string | null;
  type?: string | null;
  notes?: string | null;
}): string {
  const parts = [`Hello ${BUREAU}!`];
  parts.push(opts.name ? `I'm ${opts.name} and I'd like to request a meeting.` : `I'd like to request a meeting.`);
  const slotBits = [opts.date, opts.time].filter(Boolean);
  if (slotBits.length) parts.push(`Preferred slot: ${slotBits.join(' at ')}.`);
  if (opts.type) parts.push(`Session type: ${opts.type}.`);
  if (opts.notes && opts.notes.trim()) parts.push(`Note: ${opts.notes.trim()}`);
  return parts.join(' ');
}

/** Profile-help message that mentions the customer's profile context. */
export function buildProfileHelpMessage(name?: string | null, profileId?: string | null): string {
  const who = name ? ` I'm ${name}` : '';
  const ref = profileId ? ` (profile ref ${String(profileId).slice(0, 8)}…)` : '';
  return `Hello ${BUREAU}!${who}${ref}. Please help me with my matrimonial profile — matches, verification or membership.`;
}
