'use client';

import { Sparkles, ChevronRight } from 'lucide-react';

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
  password: 'demo123',
};

const ALT_IDENTIFIERS = ['shubhadmin'];

type Props = {
  /** Called with the credentials to fill. Parent forwards to <AdminLoginForm prefill=… />. */
  onFill: (creds: DemoCredentials) => void;
  /** Override the displayed credentials (e.g. for staging). */
  credentials?: DemoCredentials;
  /**
   * If true, clicking Fill also auto-submits the form ~250ms after the fields
   * are populated. The parent owns the actual submit; this prop only signals
   * intent so the button copy can adapt.
   *
   * The parent gates this with the deploy-time env flag
   * `NEXT_PUBLIC_ALLOW_DEMO_AUTO_LOGIN` AND a check that we are NOT in
   * production. See app/admin/login/page.tsx for the gate.
   */
  autoSubmitAfterFill?: boolean;
};

export default function DemoModeBanner({
  onFill,
  credentials = DEFAULT_DEMO_CREDENTIALS,
  autoSubmitAfterFill = false,
}: Props) {
  const handleFill = () => {
    onFill({ identifier: credentials.identifier, password: credentials.password });
  };

  const altChips = ALT_IDENTIFIERS.map((id) => ({ id, password: credentials.password }));

  return (
    <section
      aria-labelledby="demo-mode-banner-title"
      className="relative overflow-hidden rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 shadow-[0_2px_10px_rgba(180,120,30,0.08)]"
    >
      <header className="flex items-center gap-2">
        <Sparkles aria-hidden size={16} className="text-amber-700" />
        <h2
          id="demo-mode-banner-title"
          className="text-xs font-black uppercase tracking-[0.18em] text-amber-700"
        >
          Demo Mode Active
        </h2>
      </header>

      <p className="mt-2 text-[13px] font-semibold text-amber-900">Test credentials:</p>

      <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2">
        <div className="min-w-0">
          <div className="truncate font-mono text-[13px] font-semibold text-amber-950">{credentials.identifier}</div>
          <div className="truncate font-mono text-[12px] text-amber-900/70">
            password: {credentials.password}
          </div>
        </div>
        <button
          type="button"
          onClick={handleFill}
          aria-label="Fill demo credentials into the form"
          className="inline-flex flex-shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[13px] font-bold text-amber-700 transition hover:text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
        >
          Fill <ChevronRight size={14} />
        </button>
      </div>

      {altChips.length > 0 && (
        <p className="mt-2 text-[11.5px] text-amber-900/70">
          Alternate username: {altChips.map((c) => c.id).join(', ')} (same password)
        </p>
      )}

      {autoSubmitAfterFill && (
        <p className="mt-2 text-[11px] font-medium text-amber-800">
          Auto-submit is <strong>enabled</strong> on this deploy (env flag on). Pressing Fill
          will fill the fields and submit immediately.
        </p>
      )}

      {/* No-data-leaves note */}
      <p className="mt-3 text-[11px] uppercase tracking-wider text-amber-900/55">
        Demo mode · no real auth bypass on production
      </p>
    </section>
  );
}
