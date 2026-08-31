'use client'

import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// Compatibility scoring + many icon imports = biggest single client component
// in the customer area. Defer until after first paint so the route lands
// immediately and the cards stream in.
const RecommendedMatches = dynamic(
  () => import('../../../components/customer/RecommendedMatches'),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-2xl border border-[#f2d9a8] bg-[#fffaf3]"
          >
            <div className="h-44 w-full animate-pulse bg-gradient-to-br from-[#f6e8d8] via-[#f2d9a8] to-[#efd9bd]" />
            <div className="space-y-3 p-4">
              <div className="h-5 w-2/3 animate-pulse rounded bg-[#f2d9a8]/60" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-[#f2d9a8]/40" />
              <div className="flex gap-2">
                <div className="h-8 w-20 animate-pulse rounded-full bg-[#f2d9a8]/40" />
                <div className="h-8 w-32 animate-pulse rounded-full bg-[#f2d9a8]/40" />
              </div>
            </div>
          </div>
        ))}
        <div className="col-span-full mt-4 flex items-center justify-center gap-2 text-xs text-[#6a4a57]">
          <Loader2 className="h-4 w-4 animate-spin text-[#7b102d]" />
          Finding your best matches…
        </div>
      </div>
    ),
  }
);

export default function RecommendedPage() {
  return (
    <div className="min-h-screen bg-[#fffaf8] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-black text-[#2c0d16]">Recommended Matches</h1>
          <div className="flex gap-2">
            <Link href="/customer" className="rounded-full border px-4 py-2 text-sm">Back</Link>
          </div>
        </div>

        <RecommendedMatches />
      </div>
    </div>
  );
}
