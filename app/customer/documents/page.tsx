'use client'

import React from 'react';
import Link from 'next/link';
import DocumentsCenter from '../../../components/customer/DocumentsCenter';

export default function DocumentsPage() {
  return (
    <div className="min-h-screen bg-[#fffaf8] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-black text-[#2c0d16]">Documents & Kundli</h1>
          <div className="flex gap-2">
            <Link href="/customer" className="rounded-full border px-4 py-2 text-sm">Back</Link>
          </div>
        </div>

        <DocumentsCenter />
      </div>
    </div>
  );
}
