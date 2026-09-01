'use client'

/**
 * Compact verified-document badges for the customer dashboard profile card.
 *
 * Renders one badge per document category the user has uploaded, in priority
 * order (the most regulator-relevant docs first), and tags each badge with
 * the actual review status (Approved / Pending / Rejected) so the viewer
 * can tell the difference between "we have it" and "admin has approved it".
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock4, XCircle, BadgeCheck, IdCard, FileText, GraduationCap, Wallet, Camera, Sparkles, ScrollText } from 'lucide-react';
import type { CustomerDocument } from '@/lib/document-api';

type DocType = CustomerDocument['documentType'];

const BADGE_DEFS: Array<{
  type: DocType;
  label: string;
  shortLabel: string;
  icon: typeof IdCard;
  /** How essential this doc is — used to sort badges (highest first). */
  weight: number;
}> = [
  { type: 'identity',   label: 'ID Verified',             shortLabel: 'ID',          icon: IdCard,         weight: 10 },
  { type: 'income',     label: 'Income Proof Uploaded',   shortLabel: 'Income',      icon: Wallet,         weight: 8 },
  { type: 'kundli',     label: 'Kundli Uploaded',         shortLabel: 'Kundli',      icon: Sparkles,       weight: 7 },
  { type: 'education',  label: 'Education Verified',      shortLabel: 'Education',   icon: GraduationCap,  weight: 6 },
  { type: 'address',    label: 'Address Verified',        shortLabel: 'Address',     icon: FileText,       weight: 5 },
  { type: 'photograph', label: 'Photograph on File',      shortLabel: 'Photo',       icon: Camera,         weight: 4 },
  { type: 'other',      label: 'Additional Document',     shortLabel: 'Other',       icon: ScrollText,     weight: 1 },
];

function normalize(status?: string | null): 'Approved' | 'Pending' | 'Rejected' {
  const lower = String(status || '').toLowerCase();
  if (lower.includes('approved')) return 'Approved';
  if (lower.includes('rejected')) return 'Rejected';
  return 'Pending';
}

type DocLike = { documentType?: string | null | undefined; status?: string | null | undefined };

export default function DocumentBadges({ documents, dense = false }: { documents: DocLike[]; dense?: boolean }) {
  // Local copy so a parent re-render that hasn't reached us yet doesn't reset
  // the visual state when nothing meaningful changed.
  const [local, setLocal] = useState<DocLike[]>(documents || []);

  useEffect(() => {
    setLocal(documents || []);
  }, [documents]);

  if (!local.length) {
    if (dense) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-[#6a4a57]">
        <BadgeCheck size={12} className="opacity-50" />
        No documents uploaded yet
      </div>
    );
  }

  // For each badge definition, find the latest document of that type.
  const badges = BADGE_DEFS
    .map((b) => {
      const docsOfType = local.filter((d) => d.documentType === b.type);
      if (!docsOfType.length) return null;
      const status = normalize(docsOfType[0].status);
      return { ...b, status };
    })
    .filter((b): b is typeof BADGE_DEFS[number] & { status: 'Approved' | 'Pending' | 'Rejected' } => Boolean(b))
    .sort((a, b) => b.weight - a.weight);

  if (!badges.length) return null;

  return (
    <div className={`flex flex-wrap ${dense ? 'gap-1' : 'gap-1.5'}`}>
      {badges.map((b) => {
        const Icon = b.icon;
        const tone =
          b.status === 'Approved'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : b.status === 'Rejected'
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : 'bg-amber-50 text-amber-700 border-amber-200';
        return (
          <span
            key={b.type}
            title={`${b.label} — ${b.status}`}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${dense ? 'text-[10px]' : 'text-[11px]'} font-bold ${tone}`}
          >
            {b.status === 'Approved' ? (
              <CheckCircle2 size={dense ? 10 : 12} />
            ) : b.status === 'Rejected' ? (
              <XCircle size={dense ? 10 : 12} />
            ) : (
              <Clock4 size={dense ? 10 : 12} />
            )}
            <Icon size={dense ? 10 : 12} />
            {dense ? b.shortLabel : b.label}
          </span>
        );
      })}
    </div>
  );
}
