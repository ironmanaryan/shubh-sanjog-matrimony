'use client';

import { useState } from 'react';
import { Sparkles, Copy, ChevronRight } from 'lucide-react';

/**
 * "Demo Mode Active" banner shown above the admin sign-in form.
 *
 * IMPORTANT — security boundary
 * This component ONLY fills the visible input fields. It does NOT authenticate
 * anyone. Submitting the form still goes through /api/admin/login, which still
 * verifies bcrypt-hashed credentials stored in admin_users. If no admin row
 * exists with the demo credentials, the login will fail with "Invalid
 * credentials" exactly like any other wrong-password attempt.
 *
 * The Fill → button exists so reviewers / QA can populate the form quickly
 * without having to copy and paste. It does not bypass auth.
 *
 * The defaults reflect the credentials the operator typically seeds:
 *   - admin@demo.in   (local/demo environments)
 *   - shubhadmin       (alternate username the team uses)
 * Both are filled with the SAME password so the operator can sign in via
 * either column. If your seeded admin uses a different password, just type it
 * over before submitting — the Fill button only populates, never overrides
 * what you've already typed.
 */

export type DemoCredentials = {
  identifier: string;
  password: string;
};

export const DEFAULT_DEMO_CREDENTIALS: DemoCredentials = {
  identifier: 'admin@demo.in',
  password: 'password123',
};

const ALT_IDENTIFIERS = ['shubhadmin'];

type Props = {
  /** Called with the credentials to fill. Parent forwards to <AdminLoginForm prefill=… />. */
  onFill: (creds: DemoCredentials) => void;
  /** Override the displayed credentials (e.g. for staging). */
  credentials?: DemoCredentials;
};

export default function DemoModeBanner({ onFill, credentials = DEFAULT_DEMO_CREDENTIALS }: Props) {
  const [copied, setCopied] = useState(false);

  const handleFill = () => {
    onFill({ identifier: credentials.identifier, password: credentials.password });
  };

  const handleCopy = async () => {
    const text = `${credentials.identifier} / ${credentials.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard API blocked — silently ignore */
    }
  };

  const altChips = ALT_IDENTIFIERS.map((id) => ({ id, password: credentials.password }));

  return (
    <section
      aria-labelledby="demo-mode-banner-title"
      className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-amber-50 to-orange-50 p-4 shadow-[0_2px_12px_rgba(180,120,30,0.10)]"
    >
      {/* corner sparkle accent */}
      <Sparkles
        aria-hidden
        size={56}
        className="pointer-events-none absolute -right-3 -top-3 rotate-12 text-amber-200/60"
      />

      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-md">
          <Sparkles size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="demo-mode-banner-title"
            className="text-xs font-black uppercase tracking-[0.18em] text-amber-900"
          >
            Demo Mode Active
          </h2>
          <p className="mt-0.5 text-[13px] font-medium text-amber-900/80">
            Sign in instantly using these credentials. The form below is filled when you click{' '}
            <strong className="font-bold">Fill&nbsp;→</strong>.
          </p>

          <dl className="mt-3 space-y-1.5 text-[12.5px] text-amber-950">
            <div className="flex items-center gap-2">
              <dt className="w-16 shrink-0 font-bold uppercase tracking-wide text-amber-900/70">
                Email
              </dt>
              <dd className="flex-1 truncate font-mono text-[12px]">
                <code className="rounded bg-white/70 px-1.5 py-0.5">{credentials.identifier}</code>
                {altChips.map((c) => (
                  <code
                    key={c.id}
                    className="ml-1 rounded bg-white/70 px-1.5 py-0.5"
                  >
                    {c.id}
                  </code>
                ))}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="w-16 shrink-0 font-bold uppercase tracking-wide text-amber-900/70">
                Password
              </dt>
              <dd className="flex-1 truncate font-mono text-[12px]">
                <code className="rounded bg-white/70 px-1.5 py-0.5">{credentials.password}</code>
              </dd>
            </div>
          </dl>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleFill}
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-md transition hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            >
              Fill <ChevronRight size={14} />
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white/70 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              aria-live="polite"
            >
              <Copy size={12} /> {copied ? 'Copied!' : 'Copy'}
            </button>
            <span className="ml-auto text-[10.5px] font-medium uppercase tracking-wider text-amber-900/60">
              No data leaves your browser
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
