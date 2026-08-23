import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarCheck2,
  HeartHandshake,
  Lock,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';
import Button from '@/components/ui/button';
import Reveal from '@/components/ui/reveal';
import PlanCards from '../components/PlanCards';
import { getMembershipPlans } from '../lib/plans';

// Public landing page. Pricing is rendered server-side from the SQLite
// `membership_plans` table (single source of truth) — never hardcoded here.
export const dynamic = 'force-dynamic';

// Authentic traditional Indian bride & groom in royal wedding attire —
// embroidered sherwani & regal red lehenga. Stored locally in /public so the
// hero always resolves a high-res asset with zero external dependency.
const HERO_IMAGE = '/images/hero-bride-groom.jpg';

const stats = [
  { label: 'Verified Profiles', value: '12K+' },
  { label: 'Happy Families', value: '4.5L+' },
  { label: 'Success Stories', value: '98%' },
];

const benefits = [
  {
    icon: ShieldCheck,
    title: 'Verified & Secure',
    description: 'Every profile is checked for authenticity to give families a safe and trustworthy matchmaking experience.',
  },
  {
    icon: Users,
    title: 'Culturally Aligned',
    description: 'Find matches based on your values, family orientation, preferences, and lifestyle compatibility.',
  },
  {
    icon: HeartHandshake,
    title: 'Relationship First',
    description: 'We focus on meaningful connections and long-term compatibility rather than quick matches.',
  },
];

const steps = [
  {
    number: '01',
    title: 'Create Profile',
    description: 'Register with OTP, complete your biodata, family details, and partner preferences.',
  },
  {
    number: '02',
    title: 'Get Verified & Matched',
    description: 'Our team verifies your documents, then shares profiles matched to your preferences.',
  },
  {
    number: '03',
    title: 'Meet & Commit',
    description: 'Book consultations and meetings, express interest, and take the next step toward a lifelong bond.',
  },
];

export default async function HomePage() {
  const plans = await getMembershipPlans();

  return (
    <div>
      {/* ─── Hero: symmetrical two-column grid (copy ⇆ imagery) ─────────── */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 bg-hero-glow" />
        <div aria-hidden="true" className="absolute -left-28 top-20 h-72 w-72 rounded-full bg-luxe-gold/15 blur-3xl" />
        <div aria-hidden="true" className="absolute -right-24 bottom-8 h-80 w-80 rounded-full bg-royal/10 blur-3xl" />
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px gold-rule opacity-70" />

        {/* Symmetrical 2-column grid: equal-width tracks, both cells stretching
            to one shared row height so the frame aligns flush with the copy. */}
        <div className="relative mx-auto grid max-w-7xl items-stretch gap-12 px-4 pb-16 pt-14 sm:px-6 sm:pt-16 lg:grid-cols-2 lg:gap-12 lg:pb-24 lg:pt-24 xl:gap-14">
          {/* Left column — copy (vertically centred against the imagery) */}
          <div className="order-2 flex flex-col justify-center lg:order-1">
            <Reveal>
              <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-luxe-gold/60 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-royal shadow-luxe-sm backdrop-blur-md">
                <Sparkles size={14} className="text-luxe-gold-deep" />
                Trusted by 4,50,000+ families
              </span>
            </Reveal>

            <Reveal delay={120}>
              <h1 className="font-display text-5xl leading-[1.04] text-[#2c0d16] sm:text-6xl">
                Find your <span className="italic text-gradient-royal">forever</span> with grace.
              </h1>
            </Reveal>

            <Reveal delay={220}>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[#5a3743]">
                Discover meaningful connections built on shared values, family harmony, and long-term compatibility
                through a safe and respectful matchmaking journey.
              </p>
            </Reveal>

            <Reveal delay={320}>
              <div className="mt-9 flex flex-col gap-4 sm:flex-row">
                <Button href="/register" size="lg">
                  Create Your Profile
                  <ArrowRight size={18} />
                </Button>
                <Button href="#plans" variant="outline" size="lg">
                  View Membership Plans
                </Button>
              </div>
            </Reveal>

            <Reveal delay={420}>
              <ul className="mt-8 flex flex-wrap gap-2.5">
                {[
                  { icon: ShieldCheck, label: 'Admin-verified profiles' },
                  { icon: Lock, label: 'Privacy first' },
                  { icon: HeartHandshake, label: 'Guided matchmaking' },
                ].map(({ icon: Icon, label }) => (
                  <li
                    key={label}
                    className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/60 px-3.5 py-1.5 text-xs font-semibold text-royal-deep shadow-sm backdrop-blur-md"
                  >
                    <Icon size={13} className="text-luxe-gold-deep" />
                    {label}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={520}>
              <div className="mt-9 grid max-w-lg grid-cols-3 gap-3 sm:gap-4">
                {stats.map((stat) => (
                  <div key={stat.label} className="glass-panel card-hover rounded-2xl px-3.5 py-4 shadow-luxe-sm sm:px-4">
                    <div className="font-display text-2xl font-bold text-royal sm:text-3xl">{stat.value}</div>
                    <div className="mt-1.5 text-[11px] leading-4 text-[#5a3743] sm:text-sm">{stat.label}</div>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={600}>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-[#6f4a57]">
                <Link href="/login" className="underline-offset-4 transition hover:text-royal hover:underline">
                  Customer Login
                </Link>
                <span aria-hidden="true" className="hidden h-3.5 w-px bg-luxe-gold/60 sm:block" />
                <Link href="/admin" className="underline-offset-4 transition hover:text-royal hover:underline">
                  Admin Panel
                </Link>
              </div>
            </Reveal>
          </div>

          {/* Right column — traditional Indian bride & groom in royal wedding
              attire; the frame stretches to match the copy column exactly. */}
          <Reveal delay={180} className="order-1 h-full lg:order-2">
            <div className="relative mx-auto flex h-full w-full max-w-md flex-col justify-center sm:max-w-lg lg:max-w-none">
              {/* soft gold-maroon aura behind the frame */}
              <div
                aria-hidden="true"
                className="absolute -inset-5 rounded-[44px] bg-gradient-to-br from-luxe-gold/25 via-transparent to-royal/25 blur-2xl"
              />

              <figure className="card-hover relative m-0 h-full w-full overflow-hidden rounded-[36px] border border-luxe-gold/60 bg-luxe-cream shadow-luxe">
                <div className="relative aspect-[4/5] w-full sm:aspect-[4/5] lg:aspect-auto lg:h-full lg:min-h-[540px]">
                  <Image
                    src={HERO_IMAGE}
                    alt="Traditional Indian bride in a regal red lehenga beside the groom in an embroidered cream sherwani and maroon safa"
                    fill
                    preload
                    quality={85}
                    sizes="(min-width: 1024px) 46vw, (min-width: 640px) 90vw, 100vw"
                    className="object-cover object-center"
                  />
                  {/* warm gradient blend so the frame melts into the theme */}
                  <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-royal-deep/25 via-transparent to-transparent" />
                  <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px gold-rule" />

                  {/* floating accent chips — mirrored corners for symmetry */}
                  <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-luxe-gold/60 bg-white/85 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-royal shadow-luxe-sm backdrop-blur-md sm:left-5 sm:top-5">
                    <Sparkles size={12} className="text-luxe-gold-deep" />
                    Royal Weddings
                  </span>
                  <span className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full border border-white/40 bg-royal/90 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-luxe-gold-soft shadow-luxe-sm backdrop-blur-md sm:bottom-5 sm:right-5">
                    <ShieldCheck size={12} />
                    Verified Matches
                  </span>
                </div>
              </figure>

              {/* decorative gold accents */}
              <div
                aria-hidden="true"
                className="absolute -bottom-6 -left-6 -z-10 hidden h-28 w-28 rounded-full border-2 border-luxe-gold/40 lg:block"
              />
              <div
                aria-hidden="true"
                className="absolute -right-5 -top-5 -z-10 hidden h-20 w-20 rounded-full bg-gradient-to-br from-luxe-gold/30 to-transparent lg:block"
              />
            </div>
          </Reveal>
        </div>
      </section>

      <section id="about" className="scroll-mt-header mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <Reveal className="mx-auto mb-12 max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#e9d8a4] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#7b102d]">
            <Star size={14} />
            Why choose us
          </div>
          <h2 className="mt-5 font-display text-3xl leading-tight tracking-[-0.02em] text-[#2c0d16] sm:text-4xl lg:text-5xl">
            Thoughtful matchmaking with family values at heart.
          </h2>
          <p className="mt-4 text-base leading-7 text-[#5a3743]">
            Our platform blends personal guidance, verified profiles, and culture-aware recommendations to help
            families make informed, confidence-building decisions.
          </p>
        </Reveal>

        {/* Strict straight rows: equal-height cards, 2 aligned columns on
            tablets, single column on mobile with clean vertical rhythm. */}
        <div className="grid grid-cols-1 items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {benefits.map(({ icon: Icon, title, description }, index) => (
            <Reveal key={title} delay={index * 130} className="h-full">
              <article className="card-hover group flex h-full flex-col rounded-[28px] border border-[#f2d8a8] bg-white p-7 shadow-soft">
                <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fff2d4] to-[#f9e3b3] text-[#7b102d] shadow-sm transition-transform duration-300 ease-out group-hover:scale-110">
                  <Icon size={24} />
                </div>
                <h3 className="font-display text-xl font-bold leading-snug text-[#2c0d16]">{title}</h3>
                <p className="mt-3 flex-1 text-sm leading-7 text-[#5a3743]">{description}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-header bg-[#fffaf4] py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#e9d8a4] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#7b102d]">
              How it works
            </div>
            <h2 className="mt-5 font-display text-3xl tracking-[-0.02em] text-[#2c0d16] sm:text-4xl lg:text-5xl">
              Simple steps to a meaningful beginning
            </h2>
          </Reveal>

          {/* Same strict grid contract: equal heights, 2 columns on tablets. */}
          <div className="grid grid-cols-1 items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
            {steps.map((step, index) => (
              <Reveal key={step.number} delay={index * 140} className="h-full">
                <article className="card-hover group flex h-full flex-col rounded-[30px] border border-[#f3dfab] bg-white p-7 shadow-soft">
                  <div className="mb-5 inline-flex w-fit items-center justify-center rounded-full bg-gradient-to-r from-[#7b102d] to-[#a91336] px-4 py-1.5 text-sm font-black tracking-wide text-luxe-gold-soft shadow-sm transition-transform duration-300 ease-out group-hover:scale-110">
                    {step.number}
                  </div>
                  <h3 className="font-display text-2xl font-bold leading-snug text-[#2c0d16]">{step.title}</h3>
                  <p className="mt-4 flex-1 text-sm leading-7 text-[#5a3743]">{step.description}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="plans" className="scroll-mt-header mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <Reveal className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#e9d8a4] bg-[#fffdf8] px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#7b102d]">
            Membership plans
          </div>
          <h2 className="mt-5 font-display text-3xl tracking-[-0.02em] text-[#2c0d16] sm:text-4xl lg:text-5xl">
            Choose what fits your family best
          </h2>
        </Reveal>

        <PlanCards plans={plans} />
      </section>

      <section id="consultation" className="scroll-mt-header bg-royal-silk py-20 text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:px-8">
          <Reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#f7de9b]">
              <CalendarCheck2 size={14} />
              Consultation
            </div>
            <h2 className="mt-6 font-display text-3xl tracking-[-0.02em] sm:text-4xl lg:text-5xl">
              Need guidance in finding the right match?
            </h2>
            <p className="mt-5 max-w-xl text-base leading-8 text-[#f4d9d6]">
              Book a one-to-one consultation for ₹599 — choose your appointment date and time slot, pay online via UPI, and speak with our matchmaking experts for personalized advice.
            </p>
          </Reveal>

          <Reveal delay={160}>
            <div className="card-hover rounded-[28px] border border-luxe-gold/30 bg-white/5 p-6 shadow-luxe backdrop-blur-sm">
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f5d98a] text-[#7b102d]">
                    <BriefcaseBusiness size={18} />
                  </div>
                  <div>
                    <div className="font-bold">Personalized matchmaking support</div>
                    <div className="text-sm text-[#f4d9d6]">Available with every consultation</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f5d98a] text-[#7b102d]">
                    <HeartHandshake size={18} />
                  </div>
                  <div>
                    <div className="font-bold">Relationship guidance</div>
                    <div className="text-sm text-[#f4d9d6]">Expert advice for family expectations</div>
                  </div>
                </div>
              </div>

              <a
                href="#plans"
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#f7d98b] px-5 py-3 text-sm font-bold text-[#4d0f21] transition-all duration-300 hover:scale-[1.02] hover:bg-[#f5cf71] hover:shadow-glow"
              >
                Book a Consultation
                <ArrowRight size={16} />
              </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
