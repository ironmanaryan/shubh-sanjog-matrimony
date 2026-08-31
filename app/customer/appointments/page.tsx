import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// Skeleton kept as a module-level React component so the dynamic() loader
// is a plain function reference rather than an arrow that returns JSX inside
// dynamic()'s options object. (Returning JSX from an arrow inside the
// options object was tripping the Vercel build with an ECMAScript parser
// error at line 8 — see "Ecma file had an error … page.tsx:8:28".) The
// loader now just calls this component.
function AppointmentBookingSkeleton() {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-[#f2d9a8] bg-white">
      <div className="flex flex-col items-center gap-3 text-sm text-[#6a4a57]">
        <Loader2 className="h-6 w-6 animate-spin text-[#7b102d]" />
        Loading appointment calendar…
      </div>
    </div>
  );
}

// Calendar widget pulls a date library and a customer-only API surface — only
// people who click into /customer/appointments need it. Lazy-load so the main
// /customer bundle stays small.
const AppointmentBooking = dynamic(
  () => import('../../../components/customer/AppointmentBooking'),
  { ssr: false, loading: () => <AppointmentBookingSkeleton /> }
);

export default function CustomerAppointmentsPage() {
  return (
    <div className="min-h-screen bg-[#fffaf8] px-4 py-8 text-[#2c0d16] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 rounded-[28px] border border-[#f1d7a6] bg-white p-5 shadow-soft lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#7b102d]">Customer panel</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#2c0d16]">Appointments</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/customer" className="rounded-full border border-[#e5c88d] bg-[#fffaf0] px-4 py-2 text-sm font-semibold text-[#7b102d]">Dashboard</Link>
          </div>
        </div>

        <AppointmentBooking />
      </div>
    </div>
  );
}
