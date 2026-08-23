'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, Clock3, MapPin, MessageSquareText, Phone, Send, ShieldCheck } from 'lucide-react';
import GlassCard from '@/components/ui/glass-card';
import WhatsAppIcon from '@/components/ui/whatsapp-icon';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const WHATSAPP_URL = 'https://wa.me/919034850873';

const inputClass =
  'w-full rounded-xl border border-[#f2d9a8] bg-[#fffaf3] px-4 py-3 text-sm text-[#2c0d16] outline-none transition placeholder:text-[#b09a92] focus:border-[#d4a64a] focus:ring-2 focus:ring-[#d4a64a]/25 disabled:opacity-70';

type FieldErrors = { name?: string; mobile?: string; email?: string; message?: string };

// Public "Contact Us" page — every submission is captured by the Express API
// (POST /api/inquiries) and managed by staff from /admin/inquiries.
export default function ContactPage() {
  const [form, setForm] = useState({ name: '', mobile: '', email: '', subject: 'General enquiry', message: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const update = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!form.name.trim()) next.name = 'Please enter your full name.';
    if (!form.mobile.trim() && !form.email.trim()) {
      next.mobile = 'Provide a mobile number or an email.';
      next.email = 'Provide a mobile number or an email.';
    } else {
      if (form.mobile.trim() && !/^[+]?[\d\s-]{10,15}$/.test(form.mobile.trim())) {
        next.mobile = 'Enter a valid mobile number.';
      }
      if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        next.email = 'Enter a valid email address.';
      }
    }
    if (!form.message.trim()) next.message = 'Please tell us how we can help.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!validate()) return;

    setBusy(true);
    try {
      // Fallback try-catch keeps the UI from crashing with
      // "TypeError: Failed to fetch" when the API is unreachable.
      const res = await fetch(`${API}/inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not submit your enquiry');
      setSent(true);
    } catch (err) {
      const networkDown = err instanceof TypeError;
      setError(
        networkDown
          ? 'We could not reach the enquiry service right now. Please WhatsApp us instead — we typically reply within a few hours.'
          : err instanceof Error
            ? err.message
            : 'Could not submit your enquiry'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fffaf8] via-[#fffdf9] to-white pb-24 pt-12 sm:pt-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Page hero */}
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-luxe-gold/60 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-royal shadow-luxe-sm backdrop-blur-md">
            <MessageSquareText size={14} className="text-luxe-gold-deep" />
            We&apos;re here to help
          </span>
          <h1 className="mt-5 font-display text-4xl leading-tight text-[#2c0d16] sm:text-5xl">
            Contact <span className="italic text-gradient-royal">Shubh Sanjog</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#5a3743]">
            Questions about memberships, matchmaking, or payments? Send us an enquiry and our team will reach out shortly.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          {/* Enquiry form */}
          <GlassCard className="p-6 shadow-soft sm:p-8">
            {sent ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
                <CheckCircle2 size={48} className="text-[#0a7d4c]" />
                <h2 className="font-display text-2xl text-[#2c0d16]">Enquiry received!</h2>
                <p className="max-w-sm text-sm leading-6 text-[#5a3743]">
                  Thank you, {form.name.split(' ')[0] || 'friend'}. Our team will contact you on the details you shared — usually within one working day.
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
                  <Link href="/" className="rounded-full border border-[#e5c88d] bg-[#fffaf0] px-5 py-2.5 text-sm font-semibold text-[#7b102d] transition hover:bg-[#fff3dd]">
                    Back to home
                  </Link>
                  <button onClick={() => { setSent(false); setForm({ name: '', mobile: '', email: '', subject: 'General enquiry', message: '' }); }} className="rounded-full bg-royal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-royal-deep">
                    Send another enquiry
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="contact-name" className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-[#7b102d]">Full name *</label>
                    <input id="contact-name" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Your name" className={inputClass} />
                    {errors.name && <p className="mt-1.5 text-xs font-semibold text-[#9b1f2f]">{errors.name}</p>}
                  </div>
                  <div>
                    <label htmlFor="contact-subject" className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-[#7b102d]">Subject</label>
                    <select id="contact-subject" value={form.subject} onChange={(e) => update('subject', e.target.value)} className={inputClass}>
                      {['General enquiry', 'Membership & plans', 'Profile verification', 'Payments & refunds', 'Technical support'].map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="contact-mobile" className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-[#7b102d]">Mobile</label>
                    <input id="contact-mobile" value={form.mobile} onChange={(e) => update('mobile', e.target.value)} placeholder="+91 98765 43210" inputMode="tel" className={inputClass} />
                    {errors.mobile && <p className="mt-1.5 text-xs font-semibold text-[#9b1f2f]">{errors.mobile}</p>}
                  </div>
                  <div>
                    <label htmlFor="contact-email" className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-[#7b102d]">Email</label>
                    <input id="contact-email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="you@example.com" className={inputClass} />
                    {errors.email && <p className="mt-1.5 text-xs font-semibold text-[#9b1f2f]">{errors.email}</p>}
                  </div>
                </div>

                <div>
                  <label htmlFor="contact-message" className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-[#7b102d]">How can we help? *</label>
                  <textarea id="contact-message" value={form.message} onChange={(e) => update('message', e.target.value)} rows={5} placeholder="Tell us about your requirement…" className={inputClass} />
                  {errors.message && <p className="mt-1.5 text-xs font-semibold text-[#9b1f2f]">{errors.message}</p>}
                </div>

                {error && (
                  <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-[#9b1f2f]">{error}</div>
                )}

                <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-royal px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-royal/20 transition hover:bg-royal-deep disabled:opacity-70 sm:w-auto sm:min-w-[220px]">
                  <Send size={15} />
                  {busy ? 'Sending…' : 'Send enquiry'}
                </button>

                <p className="flex items-start gap-2 text-xs leading-relaxed text-[#8a7340]">
                  <ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#b88b24]" />
                  Your details are used only to respond to this enquiry and are never shared with other members.
                </p>
              </form>
            )}
          </GlassCard>

          {/* Contact details */}
          <div className="space-y-4">
            <div className="card-hover rounded-[28px] border border-[#f2d9a8] bg-white p-6 shadow-soft">
              <h2 className="font-display text-xl text-[#2c0d16]">Reach us directly</h2>
              <ul className="mt-4 space-y-4 text-sm text-[#5a3743]">
                <li className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fff2d4] text-[#7b102d]"><Phone size={16} /></span>
                  <span>
                    <span className="block font-bold text-[#2c0d16]">Call us</span>
                    +91 9034850873
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e9fbf1] text-[#25D366]">
                    <WhatsAppIcon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block font-bold text-[#2c0d16]">WhatsApp</span>
                    <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#128C4A] underline underline-offset-4">Chat with our team instantly</a>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fff2d4] text-[#7b102d]"><Clock3 size={16} /></span>
                  <span>
                    <span className="block font-bold text-[#2c0d16]">Response time</span>
                    Usually within one working day
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fff2d4] text-[#7b102d]"><MapPin size={16} /></span>
                  <span>
                    <span className="block font-bold text-[#2c0d16]">Office</span>
                    Fatehabad, Haryana, India
                  </span>
                </li>
              </ul>
            </div>

            <div className="card-hover rounded-[28px] bg-gradient-to-br from-[#7b102d] via-[#8a1639] to-[#d4a64a] p-6 text-white shadow-luxe">
              <h3 className="font-display text-lg">Prefer a guided walkthrough?</h3>
              <p className="mt-2 text-sm leading-6 text-[#f9ebd2]">
                Book a one-to-one consultation (₹599) and speak directly with our matchmaking experts about your family&apos;s requirements.
              </p>
              <Link href="/customer/appointments" className="mt-4 inline-flex items-center justify-center rounded-full bg-[#f7d98b] px-5 py-2.5 text-sm font-bold text-[#4d0f21] transition hover:bg-[#f5cf71]">
                Book a consultation
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
