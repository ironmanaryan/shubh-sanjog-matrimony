import { redirect } from 'next/navigation';

// /plans maps to the homepage membership plans section (pricing lives there).
export default function PlansPage() {
  redirect('/#plans');
}
