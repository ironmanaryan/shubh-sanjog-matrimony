'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// Skeleton shown while the appointment calendar chunk is being fetched.
// Kept as a module-level React component so the dynamic() loader is a plain
// function reference (an arrow that returns JSX directly inside dynamic()'s
// options object tripped the Vercel build).
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
//
// Next 16 forbids `ssr: false` inside Server Components (see
// node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md, line 94-95),
// so the dynamic() call lives in this Client Component wrapper.
const AppointmentBooking = dynamic(
  () => import('./AppointmentBooking'),
  { ssr: false, loading: () => <AppointmentBookingSkeleton /> }
);

export default function AppointmentBookingLoader() {
  return <AppointmentBooking />;
}