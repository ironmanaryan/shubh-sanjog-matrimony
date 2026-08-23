'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

export type FaqItem = { question: string; answer: ReactNode };
export type FaqCategory = { id: string; title: string; items: FaqItem[] };

// Structured Accordion UI for the FAQ page. One item open at a time per
// category; fully keyboard accessible.
function AccordionItem({ item, open, onToggle, panelId }: { item: FaqItem; open: boolean; onToggle: () => void; panelId: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#f2d8a8] bg-white shadow-soft">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[#fffaf3]"
      >
        <span className="text-[15px] font-bold text-[#2c0d16]">{item.question}</span>
        <ChevronDown size={18} className={`shrink-0 text-[#b88b24] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div
        id={panelId}
        role="region"
        aria-label={item.question}
        hidden={!open}
        className="border-t border-[#f5e7c6] bg-[#fffdf8] px-5 py-4 text-[15px] leading-7 text-[#4a2a35]"
      >
        {item.answer}
      </div>
    </div>
  );
}

export default function FaqAccordion({ categories }: { categories: FaqCategory[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const uid = useId();

  return (
    <div className="space-y-10">
      {categories.map((category) => (
        <section key={category.id} id={category.id} className="scroll-mt-24">
          <h2 className="mb-4 flex items-center gap-3 text-xl font-black tracking-tight text-[#7b102d]">
            <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-[#7b102d] to-[#d4a64a]" />
            {category.title}
          </h2>
          <div className="space-y-3">
            {category.items.map((item) => {
              // Stable key per category+question
              const key = `${category.id}:${item.question}`;
              return (
                <AccordionItem key={key} item={item} open={openKey === key} onToggle={() => setOpenKey(openKey === key ? null : key)} panelId={`${uid}-${category.id}-${category.items.indexOf(item)}`} />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
