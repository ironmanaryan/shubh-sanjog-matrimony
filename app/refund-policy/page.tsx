import { redirect } from 'next/navigation';

// /refund-policy is the navbar-facing alias of the existing /refund page.
export default function RefundPolicyPage() {
  redirect('/refund');
}
