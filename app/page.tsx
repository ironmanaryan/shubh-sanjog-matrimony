import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarCheck2,
  CalendarDays,
  GraduationCap,
  Heart,
  HeartHandshake,
  Lock,
  MapPin,
  Ruler,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';
import dynamicImport from 'next/dynamic';
import Button from '@/components/ui/button';
import Reveal from '@/components/ui/reveal';
import { getMembershipPlans } from '../lib/plans';
import { HERO_BLUR_DATA_URL } from '../lib/hero-blur';

// Heavy below-the-fold pricing grid deferred to reduce TBT / main-thread
// work on initial paint. Dynamic import still code-splits the chunk; `ssr:false`
// is intentionally omitted here because this file is a Server Component and
// Next 16 forbids `ssr:false` inside Server Components (see fix for Vercel
// build failure on line 27). The deferred chunk still loads after hydration.
const PlanCards = dynamicImport(() => import('../components/PlanCards'), {
  loading: () => <div className="mx-auto max-w-6xl animate-pulse rounded-[30px] border border-[#f2d9a8] bg-white/50 p-8 text-center text-sm text-[#8a6a75]">Loading plans…</div>,
});

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
  {
    icon: Lock,
    title: 'Privacy Assured',
    description: 'Your photos, contact details, and biodata stay confidential — shared only with families you approve.',
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
  {
    number: '04',
    title: 'Celebrate Match',
    description: 'From roka to the wedding day — celebrate your union with family blessings and begin your new journey.',
  },
];

// ─── Featured profiles (suggested matches) ──────────────────────────────────
// Static showcase data for the landing page. Avatars are gradient circles with
// initials — no external or local image assets required.
type FeaturedProfile = {
  id: string;
  name: string;
  initials: string;
  gender: 'groom' | 'bride';
  age: string;
  height: string;
  profession: string;
  qualification: string;
  location: string;
  community: string;
};

const suggestedProfiles: FeaturedProfile[] = [
  {
    id: 'rahul-sharma',
    name: 'Rahul Sharma',
    initials: 'RS',
    gender: 'groom',
    age: '28 Yrs',
    height: "5'11\"",
    profession: 'Software Engineer',
    qualification: 'M.Tech',
    location: 'Nagpur',
    community: 'Brahmin',
  },
  {
    id: 'amit-deshmukh',
    name: 'Amit Deshmukh',
    initials: 'AD',
    gender: 'groom',
    age: '30 Yrs',
    height: "6'0\"",
    profession: 'Business Analyst',
    qualification: 'MBA',
    location: 'Mumbai',
    community: 'Maratha',
  },
  {
    id: 'priya-verma',
    name: 'Priya Verma',
    initials: 'PV',
    gender: 'bride',
    age: '26 Yrs',
    height: "5'5\"",
    profession: 'Cyber Security Specialist',
    qualification: 'B.Tech',
    location: 'Pune',
    community: 'Kunbi',
  },
  {
    id: 'sneha-kulkarni',
    name: 'Sneha Kulkarni',
    initials: 'SK',
    gender: 'bride',
    age: '27 Yrs',
    height: "5'4\"",
    profession: 'Assistant Professor',
    qualification: 'M.Sc',
    location: 'Nagpur',
    community: 'Brahmin',
  },
];

// Gender-themed avatar gradients: royal maroon for grooms, warm gold for brides.
const avatarStyles: Record<FeaturedProfile['gender'], { avatar: string; chip: string }> = {
  groom: {
    avatar: 'bg-gradient-to-br from-royal-deep via-royal to-royal-soft text-luxe-gold-soft ring-luxe-gold/50',
    chip: 'bg-royal/[0.08] text-royal',
  },
  bride: {
    avatar: 'bg-gradient-to-br from-gold-200 via-gold-400 to-gold-600 text-[#4b0d1d] ring-gold-500/40',
    chip: 'bg-gold-100 text-gold-700',
  },
};

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

        {/* Responsive grid: 1 col mobile, 12-col desktop (6+6) with vertical centering */}
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 px-4 pb-10 pt-8 sm:gap-12 sm:px-6 sm:pb-16 sm:pt-14 lg:grid-cols-12 lg:gap-12 lg:pb-24 lg:pt-24 xl:gap-14">
          {/* Left column — copy (text first on mobile, 6 cols desktop) */}
          <div className="order-1 flex flex-col justify-center lg:col-span-6 lg:order-1">
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

          {/* Right column — Hero Image: prominent, grand, perfectly framed */}
          <Reveal delay={180} className="order-2 flex w-full items-center justify-center lg:order-2 lg:col-span-6">
            <div className="relative flex w-full max-w-2xl flex-col justify-center">
              {/* soft gold-maroon aura behind the frame */}
              <div
                aria-hidden="true"
                className="absolute -inset-5 rounded-[44px] bg-gradient-to-br from-luxe-gold/25 via-transparent to-royal/25 blur-2xl"
              />

              <figure className="card-hover relative m-0 w-full overflow-hidden rounded-[32px] border border-luxe-gold/60 bg-luxe-cream shadow-2xl">
                {/* Image container: h-[480px] md:h-[550px] lg:h-[620px] w-full max-w-2xl */}
                <div className="relative h-[480px] w-full max-w-2xl md:h-[550px] lg:h-[620px]">
                  <Image
                    src={HERO_IMAGE}
                    alt="Traditional Indian bride in a regal red lehenga beside the groom in an embroidered cream sherwani and maroon safa"
                    fill
                    priority={true}
                    fetchPriority="high"
                    loading="eager"
                    quality={75}
                    sizes="(max-width: 768px) 100vw, 50vw"
                    placeholder="blur"
                    blurDataURL={HERO_BLUR_DATA_URL}
                    className="object-cover object-top object-center"
                    style={{ objectPosition: 'center top' }}
                  />
                  {/* warm gradient blend so the frame melts into the theme */}
                  <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-royal-deep/25 via-transparent to-transparent" />
                  <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px gold-rule" />

                  {/* ROYAL WEDDINGS badge — top-left, neatly aligned */}
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

        {/* Responsive card grid: 2×2 on phones, single row of four from md up.
            Equal-height cards with clean rhythm at every breakpoint. */}
        <div className="grid grid-cols-2 items-stretch gap-4 sm:gap-6 md:grid-cols-4 lg:gap-8">
          {benefits.map(({ icon: Icon, title, description }, index) => (
            <Reveal key={title} delay={index * 130} className="h-full">
              <article className="card-hover group flex h-full flex-col rounded-[28px] border border-[#f2d8a8] bg-white p-5 shadow-soft sm:p-7">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fff2d4] to-[#f9e3b3] text-[#7b102d] shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 sm:mb-5 sm:h-14 sm:w-14">
                  <Icon size={22} className="sm:hidden" />
                  <Icon size={24} className="hidden sm:block" />
                </div>
                <h3 className="font-display text-lg font-bold leading-snug text-[#2c0d16] sm:text-xl">{title}</h3>
                <p className="mt-2 flex-1 text-xs leading-6 text-[#5a3743] sm:mt-3 sm:text-sm sm:leading-7">{description}</p>
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

          {/* Responsive grid contract: 2×2 on phones, one row of four from md
              up — equal heights and clean rhythm at every breakpoint. */}
          <div className="grid grid-cols-2 items-stretch gap-4 sm:gap-6 md:grid-cols-4 lg:gap-8">
            {steps.map((step, index) => (
              <Reveal key={step.number} delay={index * 140} className="h-full">
                <article className="card-hover group flex h-full flex-col rounded-[30px] border border-[#f3dfab] bg-white p-5 shadow-soft sm:p-7">
                  <div className="mb-4 inline-flex w-fit items-center justify-center rounded-full bg-gradient-to-r from-[#7b102d] to-[#a91336] px-3.5 py-1 text-xs font-black tracking-wide text-luxe-gold-soft shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 sm:mb-5 sm:px-4 sm:py-1.5 sm:text-sm">
                    {step.number}
                  </div>
                  <h3 className="font-display text-lg font-bold leading-snug text-[#2c0d16] sm:text-2xl">{step.title}</h3>
                  <p className="mt-3 flex-1 text-xs leading-6 text-[#5a3743] sm:mt-4 sm:text-sm sm:leading-7">{step.description}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Featured profiles / suggested matches ──────────────────────────── */}
      <section id="profiles" className="scroll-mt-header mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <Reveal className="mx-auto mb-12 max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#e9d8a4] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#7b102d]">
            <Sparkles size={14} />
            Suggested matches
          </div>
          <h2 className="mt-5 font-display text-3xl leading-tight tracking-[-0.02em] text-[#2c0d16] sm:text-4xl lg:text-5xl">
            Featured profiles, chosen with care.
          </h2>
          <p className="mt-4 text-base leading-7 text-[#5a3743]">
            A glimpse of our verified members — handpicked suggestions that reflect the quality of matches waiting
            for you inside.
          </p>
        </Reveal>

        {/* 1-column stack on mobile → 2×2 grid from md up. */}
        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
          {suggestedProfiles.map((profile, index) => {
            const theme = avatarStyles[profile.gender];
            return (
              <Reveal key={profile.id} delay={index * 130} className="h-full">
                <article className="group relative flex h-full flex-col overflow-hidden rounded-[28px] border border-[#f2d8a8] bg-white p-5 shadow-soft transition-all duration-300 transform hover:-translate-y-2 hover:shadow-xl hover:border-maroon-500 sm:p-7">
                  {/* gold hairline accent across the card top */}
                  <div aria-hidden="true" className="gold-rule absolute inset-x-0 top-0 h-px opacity-60" />

                  {/* Identity row: initials avatar + name + role chip + badges */}
                  <div className="flex items-center gap-4 sm:gap-5">
                    <div
                      aria-hidden="true"
                      className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-display text-lg font-bold shadow-luxe-sm ring-2 ring-offset-2 transition-transform duration-300 ease-out group-hover:scale-105 sm:h-[72px] sm:w-[72px] sm:text-xl ${theme.avatar}`}
                    >
                      {profile.initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <h3 className="font-display text-xl font-bold text-[#2c0d16] sm:text-2xl">{profile.name}</h3>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${theme.chip}`}
                        >
                          {profile.gender}
                        </span>
                      </div>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-[#6f4a57] sm:text-sm">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays size={14} className="text-luxe-gold-deep" />
                          {profile.age}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Ruler size={14} className="text-luxe-gold-deep" />
                          {profile.height}
                        </span>
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <span className="rounded-full border border-luxe-gold/60 bg-luxe-cream px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-royal">
                          {profile.community}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-royal/15 bg-royal/[0.05] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-royal">
                          <ShieldCheck size={11} />
                          Verified
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Detail rows */}
                  <ul className="mt-5 space-y-2.5 border-t border-dashed border-luxe-gold/40 pt-5 text-sm text-[#5a3743] sm:mt-6 sm:pt-6">
                    <li className="flex items-center gap-2.5">
                      <BriefcaseBusiness size={15} className="shrink-0 text-luxe-gold-deep" />
                      <span className="font-semibold text-[#2c0d16]">{profile.profession}</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <GraduationCap size={15} className="shrink-0 text-luxe-gold-deep" />
                      <span>{profile.qualification}</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <MapPin size={15} className="shrink-0 text-luxe-gold-deep" />
                      <span>{profile.location}</span>
                    </li>
                  </ul>

                  {/* CTAs — funnel into the registration/login flow */}
                  <div className="mt-auto flex gap-3 pt-6">
                    <Button href="/login" variant="outline" size="sm" className="flex-1">
                      View Profile
                    </Button>
                    <Button href="/register" variant="primary" size="sm" className="flex-1">
                      <Heart size={14} />
                      Express Interest
                    </Button>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={200}>
          <p className="mt-10 text-center text-sm text-[#6f4a57]">
            These are just a few of our 12,000+ verified members.{' '}
            <Link href="/register" className="font-semibold text-royal underline-offset-4 transition hover:text-royal-deep hover:underline">
              Register free
            </Link>{' '}
            to unlock full profiles and personalized matches.
          </p>
        </Reveal>
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
