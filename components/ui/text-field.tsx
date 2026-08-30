'use client';

import { forwardRef, useId, useState } from 'react';

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

/**
 * Floating-label input with gold/maroon focus ring and a floating error state.
 * The label rests inside the field and lifts when focused or filled.
 */
const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, className = '', id, ...rest },
  ref
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [focused, setFocused] = useState(false);
  const lifted = focused || Boolean(rest.value) || Boolean(rest.defaultValue) || rest.placeholder !== undefined;

  return (
    <div className="w-full">
      <div
        className={`group relative rounded-2xl border bg-white/80 transition-all duration-300 ${
          error
            ? 'border-red-300 shadow-[0_0_0_4px_rgba(220,38,38,0.08)]'
            : focused
              ? 'border-luxe-gold shadow-glow'
              : 'border-[#e8d9c3] hover:border-luxe-gold/50'
        }`}
      >
        <label
          htmlFor={fieldId}
          className={`pointer-events-none absolute left-11 z-10 origin-left transition-all duration-200 ${
            lifted
              ? 'top-0 -translate-y-1/2 bg-white px-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]'
              : 'top-1/2 -translate-y-1/2 px-0 text-sm font-medium'
          } ${error ? 'text-red-500' : focused ? 'text-royal' : 'text-[#a08a76]'}`}
        >
          {label}
        </label>
        <input
          ref={ref}
          id={fieldId}
          onFocus={(event) => {
            setFocused(true);
            rest.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            rest.onBlur?.(event);
          }}
          aria-invalid={Boolean(error)}
          // 16px base prevents iOS zoom; min-h 48px touch target; smooth focus
          className={`w-full min-h-[48px] rounded-2xl bg-transparent px-4 pt-5 pb-2 text-base text-[#2c0d16] outline-none placeholder:text-[#c4b29e] touch-manipulation sm:text-sm ${
            className || ''
          }`}
          {...rest}
        />
        <span
          aria-hidden="true"
          className={`absolute inset-x-6 bottom-1.5 h-px gold-rule transition-opacity duration-500 ${
            focused ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>

      <div className="min-h-[1.25rem] px-1 pt-1">
        {error ? (
          <p role="alert" className="animate-fade-up text-xs font-semibold text-red-500">
            {error}
          </p>
        ) : hint ? (
          <p className="text-xs text-[#a08a76]">{hint}</p>
        ) : null}
      </div>
    </div>
  );
});

export default TextField;
