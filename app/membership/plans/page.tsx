import { redirect } from 'next/navigation';

// /membership/plans — the public deep-link target for "Renew Membership"
// CTAs scattered across the customer surface.
// Authenticated users land directly on the checkout where they can pick a
// tier. Signed-out visitors are routed to register so the renewal flow
// doubles as a login funnel.
export default function MembershipPlansPage() {
  // Server-side redirect — can't read localStorage from a Server Component.
  // The customer-side CTA button already checks auth and bounces through
  // /login when needed; this redirect covers direct deep-links.
  redirect('/customer/membership');
}
