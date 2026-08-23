import { redirect } from 'next/navigation';

// /consultation maps to the homepage consultation section (booking + ₹599 info).
export default function ConsultationPage() {
  redirect('/#consultation');
}
