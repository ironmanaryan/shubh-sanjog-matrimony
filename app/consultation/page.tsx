import { redirect } from 'next/navigation';

// /consultation is the public "Book a Consultation" CTA target. Direct it at
// the real booking flow (/customer/appointments). Anonymous visitors bounce
// through the customer-area middleware to /login before they can land, which
// keeps the Consultation booking gated by an account (the funnel's first
// required step is Registration / Sign-in).
export default function ConsultationPage() {
  redirect('/customer/appointments');
}
