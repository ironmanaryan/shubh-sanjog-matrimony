'use client';

import { useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import UpiPaymentModal from './UpiPaymentModal';
import Button from './ui/button';
import Reveal from './ui/reveal';
import type { MembershipPlan } from '../lib/plans';

// Public pricing grid — plans come from the SQLite membership_plans table via
// the server component. "Get Started" opens the UPI checkout (UTR + receipt).
// Grid: single column on mobile → 2 aligned columns on tablets → 3 equal
// height columns on desktop; cards animate in with a staggered rise.
export default function PlanCards({ plans }: { plans: MembershipPlan[] }) {
  const [checkoutPlan, setCheckoutPlan] = useState<{ tier: string; price: number } | null>(null);

  return (
    <>
      {/* Strict grid contract: 1 column mobile → 2 aligned columns tablet →
          3 equal-height columns desktop (catalog ships exactly 3 tiers). */}
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
        {plans.map((plan, index) => (
          <Reveal key={plan.tier} delay={index * 130} className="h-full">
            <div
              className={`card-hover group flex h-full flex-col rounded-[30px] border p-7 ${
                plan.popular
                  ? 'border-luxe-gold bg-gradient-to-b from-luxe-cream to-white shadow-luxe ring-2 ring-luxe-gold/40'
                  : 'border-luxe-gold/35 bg-white shadow-luxe-sm'
              }`}
            >
              {plan.popular && (
                <div className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-luxe-gold/60 bg-royal px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-luxe-gold-soft">
                  Most popular
                </div>
              )}

              <h3 className="font-display text-2xl font-bold text-[#2c0d16]">{plan.name}</h3>
              <div className="mt-5 flex items-end gap-2">
                <span className="font-display text-4xl text-[#2c0d16]">₹{plan.price.toLocaleString('en-IN')}</span>
                <span className="pb-1 text-sm text-[#6a4a57]">
                  {plan.tier === 'Consultation' ? 'one-time' : `/ ${plan.durationDays} days`}
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-[#5a3743]">{plan.description}</p>

              <ul className="mt-6 flex-1 space-y-4 text-sm text-[#4d2c36]">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-luxe-gold/50 bg-gradient-to-br from-luxe-cream to-[#f7e9c4] text-royal transition-transform duration-300 ease-out group-hover:scale-110">
                      <BadgeCheck size={12} />
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => setCheckoutPlan({ tier: plan.tier, price: plan.price })}
                variant={plan.popular ? 'primary' : 'outline'}
                className="mt-8 w-full py-3"
              >
                Get Started
              </Button>
            </div>
          </Reveal>
        ))}
      </div>

      {/* UPI payment modal — QR / UPI ID + UTR reference + receipt upload */}
      <UpiPaymentModal plan={checkoutPlan} onClose={() => setCheckoutPlan(null)} />
    </>
  );
}
