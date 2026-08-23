import { redirect } from 'next/navigation';

// /about is served by the homepage "Why choose us" section for now —
// forward visitors there instead of a 404.
export default function AboutPage() {
  redirect('/#about');
}
