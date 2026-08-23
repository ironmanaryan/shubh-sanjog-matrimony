'use client';

import { forwardRef, useId } from 'react';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

/** Maroon-gold toggle switch replacing the browser default checkbox. */
const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, className = '', id, checked, defaultChecked, ...rest },
  ref
) {
  const autoId = useId();
  const switchId = id ?? autoId;

  return (
    <label htmlFor={switchId} className={`group inline-flex cursor-pointer items-center gap-3 ${className}`}>
      <span className="relative inline-flex">
        <input
          ref={ref}
          id={switchId}
          type="checkbox"
          role="switch"
          checked={checked}
          defaultChecked={defaultChecked}
          className="peer sr-only"
          {...rest}
        />
        <span
          aria-hidden="true"
          className="h-6 w-11 rounded-full border border-[#e4d4bd] bg-[#efe6d8] shadow-inner transition-all duration-300
            peer-checked:border-royal/40 peer-checked:bg-gradient-to-r peer-checked:from-royal peer-checked:to-royal-soft
            peer-focus-visible:ring-2 peer-focus-visible:ring-luxe-gold/60 peer-focus-visible:ring-offset-2
            group-hover:border-luxe-gold/60"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-md ring-1 ring-black/5 transition-all duration-300
            peer-checked:translate-x-5 peer-checked:bg-gradient-to-br peer-checked:from-white peer-checked:to-luxe-gold-soft"
        />
      </span>
      {label ? <span className="text-sm font-medium text-[#4a2a35]">{label}</span> : null}
    </label>
  );
});

export default Switch;
