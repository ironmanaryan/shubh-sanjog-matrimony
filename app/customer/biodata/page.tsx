'use client'

import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// Skeleton kept as a module-level component (not an inline arrow returning
// JSX) so the dynamic() loader is a clean function call. Returning JSX
// directly from an arrow inside dynamic()'s options object was tripping
// the Vercel build with an EcmaScript parser error.
function BiodataStepperSkeleton() {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-[#f2d9a8] bg-white">
      <div className="flex flex-col items-center gap-3 text-sm text-[#6a4a57]">
        <Loader2 className="h-6 w-6 animate-spin text-[#7b102d]" />
        Loading biodata builder…
      </div>
    </div>
  );
}

// The stepper drives its own data fetching and weighs >20 KB gzipped with its
// many subsections, validation schemas and Lucide icons. Defer it to a client
// chunk so the initial /customer/biodata byte budget covers only the chrome
// above the fold, not the form state machine.
const BiodataStepper = dynamic(
  () => import('../../../components/customer/BiodataStepper'),
  { ssr: false, loading: () => <BiodataStepperSkeleton /> }
);

export default function BiodataPage() {
  return (
    <div className="min-h-screen bg-[#fffaf8] px-4 pb-20 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-black text-[#2c0d16]">Biodata Builder</h1>
          <div className="flex gap-2">
            <Link href="/customer" className="rounded-full border px-4 py-2 text-sm">Back</Link>
          </div>
        </div>

        <BiodataStepper />
      </div>
    </div>
  );
}
