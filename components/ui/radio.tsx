'use client';

import { forwardRef, useId } from 'react';

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

/** Custom maroon-gold radio button with a soft gold halo when selected. */
const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, className = '', id, ...rest },
  ref
) {
  const autoId = useId();
  const radioId = id ?? autoId;

  return (
    <label htmlFor={radioId} className={`group inline-flex cursor-pointer items-center gap-2.5 ${className}`}>
      <span className="relative inline-flex">
        <input ref={ref} id={radioId} type="radio" className="peer sr-only" {...rest} />
        <span
          aria-hidden="true"
          className="h-5 w-5 rounded-full border border-[#e4d4bd] bg-white shadow-sm transition-all duration-200
            peer-checked:border-royal peer-checked:shadow-[0_0_0_4px_rgba(212,175,55,0.18)]
            peer-focus-visible:ring-2 peer-focus-visible:ring-luxe-gold/60 peer-focus-visible:ring-offset-2
            group-hover:border-luxe-gold"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-gradient-to-br from-royal to-royal-soft transition-transform duration-200 peer-checked:scale-100"
        />
      </span>
      <span className="text-sm leading-5 text-[#4a2a35]">{label}</span>
    </label>
  );
});

export default Radio;
