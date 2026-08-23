export type LoaderVariant = 'ring' | 'lotus' | 'dots';
export type LoaderSize = 'sm' | 'md' | 'lg';

const sizes: Record<LoaderSize, { box: string; text: string }> = {
  sm: { box: 'h-5 w-5', text: 'text-xs' },
  md: { box: 'h-9 w-9', text: 'text-sm' },
  lg: { box: 'h-14 w-14', text: 'text-base' },
};

/**
 * Luxury loading animations:
 *  - ring  : gold gradient spinning ring with a soft pulse halo
 *  - lotus : rotating gold petal bloom
 *  - dots  : three pulsing gold dots
 */
export default function Loader({
  variant = 'ring',
  size = 'md',
  label,
  className = '',
}: {
  variant?: LoaderVariant;
  size?: LoaderSize;
  label?: string;
  className?: string;
}) {
  const s = sizes[size];

  return (
    <span role="status" aria-live="polite" className={`inline-flex items-center gap-3 ${className}`}>
      {variant === 'ring' && (
        <span className={`relative inline-flex ${s.box}`}>
          <span aria-hidden="true" className="absolute inset-0 rounded-full bg-luxe-gold/30 animate-pulse-ring" />
          <span
            aria-hidden="true"
            className="h-full w-full animate-spin-slow rounded-full [background:conic-gradient(from_0deg,transparent_0deg,#D4AF37_120deg,#F3E3AC_220deg,transparent_300deg)]"
            style={{
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px))',
              WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px))',
            }}
          />
        </span>
      )}

      {variant === 'lotus' && (
        <span aria-hidden="true" className={`relative inline-block ${s.box} animate-spin-slow`}>
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <span
              key={deg}
              className="absolute left-1/2 top-1/2 h-1/2 w-[18%] origin-top -translate-x-1/2 rounded-full bg-gradient-to-b from-luxe-gold to-luxe-gold-soft opacity-90"
              style={{ transform: `translateX(-50%) rotate(${deg}deg)` }}
            />
          ))}
          <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-royal" />
        </span>
      )}

      {variant === 'dots' && (
        <span aria-hidden="true" className="inline-flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-gradient-to-br from-luxe-gold to-luxe-gold-deep animate-pulse-ring"
              style={{ animationDelay: `${i * 0.22}s`, animationDuration: '1.4s' }}
            />
          ))}
        </span>
      )}

      {label ? (
        <span className={`font-medium tracking-wide text-[#6f4a57] ${s.text}`}>{label}</span>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </span>
  );
}
