import { redirect } from 'next/navigation';

// /how-it-works maps to the homepage "Simple steps" section.
export default function HowItWorksPage() {
  redirect('/#how-it-works');
}
