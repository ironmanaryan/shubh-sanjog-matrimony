'use client';

import { useEffect, useRef } from 'react';

// Premium 6-digit OTP input: paste-the-whole-code support, arrow/backspace
// navigation, auto-advance, auto-submit on completion.
export default function OtpInput({
  value,
  onChange,
  onComplete,
  idPrefix = 'otp',
  disabled = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  onComplete?: (code: string) => void;
  idPrefix?: string;
  disabled?: boolean;
}) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const focusAt = (index: number) => {
    const clamped = Math.max(0, Math.min(5, index));
    inputsRef.current[clamped]?.focus();
    inputsRef.current[clamped]?.select();
  };

  const handleChange = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '');

    // Pasted (or typed) multi-digit chunk — distribute across boxes.
    if (digits.length > 1) {
      const next = [...value];
      for (let i = 0; i < digits.length && index + i < 6; i += 1) {
        next[index + i] = digits[i];
      }
      onChange(next);
      const filled = next.join('');
      if (filled.length === 6 && !filled.includes('')) onComplete?.(filled);
      else focusAt(index + digits.length);
      return;
    }

    const next = [...value];
    next[index] = digits; // '' when cleared
    onChange(next);

    if (digits && index < 5) focusAt(index + 1);
    const filled = next.join('');
    if (filled.length === 6 && !filled.includes('')) onComplete?.(filled);
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const next = [...value];
      if (next[index]) {
        next[index] = '';
        onChange(next);
      } else if (index > 0) {
        next[index - 1] = '';
        onChange(next);
        focusAt(index - 1);
      }
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      focusAt(index - 1);
    }
    if (event.key === 'ArrowRight' && index < 5) {
      event.preventDefault();
      focusAt(index + 1);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-6 gap-2 sm:gap-3">
        {value.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputsRef.current[index] = el;
            }}
            id={`${idPrefix}-${index}`}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label={`OTP digit ${index + 1}`}
            maxLength={6}
            value={digit}
            disabled={disabled}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onFocus={(event) => event.target.select()}
            className="h-12 w-full rounded-xl border border-gold-200/80 bg-[#fffaf3] text-center text-lg font-bold text-[#2c0d16] outline-none transition focus:border-maroon-700 focus:ring-2 focus:ring-maroon-700/15 disabled:opacity-60 sm:h-14"
          />
        ))}
      </div>
    </div>
  );
}
