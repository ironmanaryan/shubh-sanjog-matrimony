import { BadgeCheck } from 'lucide-react';

export interface VerifiedBadgeProps {
  label?: string;
  className?: string;
}

/** Sleek gold-ringed verified badge for profiles and cards. */
export default function VerifiedBadge({ label = 'Verified', className = '' }: VerifiedBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-luxe-gold/70 bg-gradient-to-r from-[#FFF9EC] to-[#FDF3D3] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-luxe-gold-deep shadow-[0_1px_6px_rgba(212,175,55,0.35)] ${className}`}
    >
      <BadgeCheck size={12} strokeWidth={2.5} />
      {label}
    </span>
  );
}
