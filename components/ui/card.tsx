import { forwardRef } from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
  goldBorder?: boolean;
}

/** Luxury card — soft elevation, optional gold hairline border and glassmorphism. */
const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { glass = false, goldBorder = true, className = '', children, ...rest },
  ref
) {
  const classes = [
    'rounded-3xl shadow-luxe transition-all duration-300',
    glass ? 'glass-panel' : 'bg-white',
    goldBorder && !glass ? 'border border-luxe-gold/40 hover:border-luxe-gold/80 hover:shadow-glow' : '',
    glass ? 'hover:shadow-glow' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={ref} className={classes} {...rest}>
      {children}
    </div>
  );
});

export default Card;
