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
    <div className="w-full">
      <div className="grid grid-cols-6 gap-1.5 xs:gap-2 sm:gap-3">
        {value.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputsRef.current[index] = el;
            }}
            id={`${idPrefix}-${index}`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            enterKeyHint={index === 5 ? 'done' : 'next'}
            aria-label={`OTP digit ${index + 1} of 6`}
            maxLength={1}
            value={digit}
            disabled={disabled}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onFocus={(event) => event.target.select()}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData('text');
              if (pasted && /\d/.test(pasted)) {
                event.preventDefault();
                handleChange(index, pasted);
              }
            }}
            className="h-[48px] w-full touch-manipulation rounded-xl border border-[#e8d9c3] bg-white text-center text-xl font-bold tracking-widest text-[#2c0d16] shadow-sm outline-none transition-all duration-200 placeholder:text-[#c4b29e] focus:border-royal focus:bg-white focus:ring-4 focus:ring-royal/10 disabled:cursor-not-allowed disabled:opacity-60 sm:h-14 sm:text-2xl"
          />
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-[#a08a76] sm:text-left">
        Enter the 6-digit code sent to your email
      </p>
    </div>
  );
}
