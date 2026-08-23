'use client';

import { forwardRef, useId } from 'react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

/** Custom maroon-gold checkbox with an animated gold check. */
const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className = '', id, ...rest },
  ref
) {
  const autoId = useId();
  const boxId = id ?? autoId;

  return (
    <label htmlFor={boxId} className={`group inline-flex cursor-pointer items-start gap-2.5 ${className}`}>
      <span className="relative mt-0.5 inline-flex">
        <input ref={ref} id={boxId} type="checkbox" className="peer sr-only" {...rest} />
        <span
          aria-hidden="true"
          className="h-5 w-5 rounded-md border border-[#e4d4bd] bg-white shadow-sm transition-all duration-200
            peer-checked:border-royal peer-checked:bg-gradient-to-br peer-checked:from-royal peer-checked:to-royal-soft
            peer-focus-visible:ring-2 peer-focus-visible:ring-luxe-gold/60 peer-focus-visible:ring-offset-2
            group-hover:border-luxe-gold"
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 scale-50 text-luxe-gold-soft opacity-0 transition-all duration-200 peer-checked:scale-100 peer-checked:opacity-100"
        >
          <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-sm leading-5 text-[#4a2a35]">{label}</span>
    </label>
  );
});

export default Checkbox;
