import Link from 'next/link';
import { forwardRef } from 'react';

type Variant = 'primary' | 'outline' | 'ghost' | 'gold';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold tracking-wide transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luxe-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-60';

const variants: Record<Variant, string> = {
  primary:
    'bg-royal text-[#FFF6E8] shadow-luxe-sm hover:scale-[1.02] hover:bg-royal-deep hover:-translate-y-0.5 hover:shadow-glow active:translate-y-0 active:scale-100',
  outline:
    'border border-luxe-gold/60 bg-white/70 text-royal backdrop-blur-sm hover:scale-[1.02] hover:border-luxe-gold hover:bg-luxe-gold/10 hover:-translate-y-0.5 hover:shadow-glow active:translate-y-0 active:scale-100',
  ghost: 'text-royal hover:bg-royal/[0.06] hover:text-royal-deep',
  gold: 'bg-gradient-to-r from-luxe-gold-deep via-luxe-gold to-luxe-gold-soft text-[#3F0010] shadow-luxe-sm hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-glow active:translate-y-0 active:scale-100',
};

const sizes: Record<Size, string> = {
  sm: 'px-4 py-2 text-xs',
  md: 'px-6 py-2.5 text-sm',
  lg: 'px-8 py-3.5 text-base',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  href?: string;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', href, className = '', children, ...rest },
  ref
) {
  const classes = `${base} ${variants[variant]} ${sizes[size]} ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button ref={ref} className={classes} {...rest}>
      {children}
    </button>
  );
});

export default Button;
