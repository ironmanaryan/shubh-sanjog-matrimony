import { forwardRef } from 'react';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Dark variant for use on maroon/hero backgrounds. */
  tone?: 'light' | 'dark';
}

/** Glassmorphism panel used by auth forms and hero overlays. */
const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { tone = 'light', className = '', children, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={`rounded-3xl shadow-luxe ${tone === 'dark' ? 'glass-panel-dark text-white' : 'glass-panel'} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
});

export default GlassCard;
