import Link from 'next/link';
import AppointmentBookingLoader from '../../../components/customer/AppointmentBookingLoader';

// Calendar widget pulls a date library and a customer-only API surface —
// only people who click into /customer/appointments need it. The actual
// next/dynamic(..., { ssr: false }) call lives inside the loader Client
// Component, because Next 16 forbids ssr:false inside Server Components
// (see node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md).

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

        <AppointmentBookingLoader />
      </div>
    </div>
  );
}
