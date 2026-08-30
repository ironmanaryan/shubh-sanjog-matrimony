import LegalShell, { BUREAU, LegalSection } from '../../components/legal/LegalShell';
import FaqAccordion, { type FaqCategory } from '../../components/legal/FaqAccordion';

export const metadata = {
  title: 'FAQ — Shubh Sanjog Marriage Bureau',
  description: 'Answers about UPI/UTR payment approvals, the matchmaking process, Verified Profile badges, privacy, and how our admin team manages matches.',
};

const CATEGORIES: FaqCategory[] = [
  {
    id: 'payments',
    title: 'Payments & UPI / UTR Approvals',
    items: [
      {
        question: 'How do I pay for a membership?',
        answer: (
          <>
            Choose your plan on the Membership page — Consultation ₹599, Gold ₹5,100, or Premium ₹11,000 — pay to our official UPI ID shown at checkout from any UPI app (GPay, PhonePe, Paytm, etc.), then submit the payment on our platform with the <strong>UTR / transaction reference number</strong> and a receipt screenshot.
          </>
        ),
      },
      {
        question: 'What is a UTR and where do I find it?',
        answer: (
          <>
            The UTR (Unique Transaction Reference) is a 12-digit reference generated for every UPI transfer. You will find it in your UPI app’s transaction details — it may appear as “UPI Ref No.”, “Txn Ref”, or similar. Copy it exactly into the payment form; our team matches it against our bank records to approve your membership.
          </>
        ),
      },
      {
        question: 'How long does payment verification take?',
        answer: (
          <>
            Verification is manual and normally completed within <strong>24–48 business hours</strong> of submission. Your membership activates immediately upon approval, and the validity period runs from that activation date. You can track the status (Pending Verification / Approved / Rejected) in your dashboard.
          </>
        ),
      },
      {
        question: 'My payment was rejected. What should I do?',
        answer: (
          <>
            A rejection usually means the UTR didn’t match our records (wrong amount, typo, or a duplicate reference). The reason is shown with the rejected entry. Simply re-submit with a correct UTR and clear receipt screenshot. If you believe it was rejected in error, email {BUREAU.email} with your UTR and we will re-check within one business day.
          </>
        ),
      },
      {
        question: 'I paid twice by mistake. Will I get my money back?',
        answer: (
          <>
            If two verified payments exist simultaneously for the same plan on the same account, please contact our support team at {BUREAU.email} or {BUREAU.phone} — we will review the duplicate transaction and assist you within 7–10 business days.
          </>
        ),
      },
    ],
  },
  {
    id: 'matchmaking',
    title: 'The Matchmaking Process',
    items: [
      {
        question: 'How are recommended profiles chosen for me?',
        answer: (
          <>
            Our system compares your biodata against other members’ verified profiles using your stated partner preferences — age range, religion, caste/community, mother tongue, education/profession, location, and more. The admin team reviews these preference-filtered results and shares the best-fitting profiles with you based on your plan’s profile allowance.
          </>
        ),
      },
      {
        question: 'What happens when a match is assigned to me?',
        answer: (
          <>
            When our team assigns/recommends a match, it appears in your dashboard with a notification (“New Match Assigned”). You can then shortlist it or Express Interest. Interest requests go to the other member as Pending; they can Accept or Reject. Once an interest is Accepted between two members, contact details become visible per both members’ privacy settings.
          </>
        ),
      },
      {
        question: 'Can I search for profiles myself?',
        answer: (
          <>
            Yes — the Recommended Matches page includes partner-search filters so you can browse approved profiles matching your criteria anytime. Shortlisting and expressing interest work the same way there.
          </>
        ),
      },
      {
        question: 'How many profiles and meetings do I get?',
        answer: (
          <>
            It depends on your plan: Gold (₹5,100) includes up to 20 recommended profiles and 3 meetings over 60 days; Premium (₹11,000) includes 25–30 recommended profiles, 5 meetings, and priority assistance over 90 days. The Consultation Package (₹599) covers a single consultation appointment. Usage counters are visible in your dashboard.
          </>
        ),
      },
    ],
  },
  {
    id: 'verification',
    title: 'Profile Verification & Badges',
    items: [
      {
        question: 'What does the “Verified Profile” badge mean?',
        answer: (
          <>
            The badge means our admin team has reviewed the member’s submitted biodata and supporting documents and approved the profile. It indicates an internal review — it is not a government certification or a guarantee of any personal claims. Always verify important details independently before proceeding with an alliance.
          </>
        ),
      },
      {
        question: 'Why is a member’s photo or phone number hidden?',
        answer: (
          <>
            Privacy masking is built in: photos and phone numbers stay masked until the profile is approved by our admin team or an interest between the two members is mutually accepted. Members can also keep their photo/phone hidden permanently via their privacy toggles — masking respects those choices too.
          </>
        ),
      },
      {
        question: 'Who can see my documents like Aadhaar or Kundli?',
        answer: (
          <>
            Only you and the verifying administrator. Documents are stored privately with no public URL; access happens through short-lived signed links that expire automatically. Other members only ever see masked profile views — never your documents, contact details, or internal review notes. Read more in our{' '}
            <a href="/privacy" className="font-semibold text-[#7b102d] underline">Privacy Policy</a>.
          </>
        ),
      },
      {
        question: 'My profile completion shows less than 100%. Does that matter?',
        answer: (
          <>
            Yes — a higher Profile Completion Score improves your chances: complete biodata gives our team more to match against and looks more genuine to families reviewing your profile. Fill every section of the biodata builder, then submit it for review to earn the Verified badge after approval.
          </>
        ),
      },
    ],
  },
  {
    id: 'admin',
    title: 'Admin-Managed Matches & Support',
    items: [
      {
        question: 'How does the admin team manage matches?',
        answer: (
          <>
            Behind the scenes, our administrators filter candidate profiles against each customer’s saved partner preferences, manually assign the best recommendations, and monitor each assignment’s interest status (Pending / Accepted / Rejected). Every assignment carries an internal note explaining why the match was suggested, and you’re notified inside your dashboard when a new match is assigned.
          </>
        ),
      },
      {
        question: 'Can I ask for different matches?',
        answer: (
          <>
            Absolutely. Update your Partner Preferences in the biodata section — refined preferences feed directly into future recommendations. You can also book a consultation appointment (or use a meeting credit from Gold/Premium) to discuss your requirements with our team, who will adjust the matching accordingly.
          </>
        ),
      },
      {
        question: 'Who reviews my profile and documents?',
        answer: (
          <>
            Trained staff roles at {BUREAU.name}. Administrators have full access; Relationship Managers handle profile reviews and matchmaking; support staff can view queues read-only. Payment verification is restricted to senior administrators only. Every action is logged, and internal notes added during review are never visible to customers.
          </>
        ),
      },
      {
        question: 'How do appointments and consultations work?',
        answer: (
          <>
            Book a slot from the Appointments page using a meeting credit included in your plan (Consultation includes 1; Gold 3; Premium 5). Pick an available date and time, receive a confirmation notification, and our counsellor will meet you to discuss your alliance. Double-booked slots are blocked automatically.
          </>
        ),
      },
    ],
  },
];

const QUICK_LINKS = [
  { label: 'New here? Create your profile', href: '/register' },
  { label: 'Membership plans & pricing', href: '/#plans' },
  { label: 'Privacy & document safety', href: '/privacy' },
];

export default function FaqPage() {
  return (
    <LegalShell
      title="Frequently Asked Questions"
      description={`Quick answers about payments, matchmaking, verification badges, and how our team manages matches at ${BUREAU.name}. Can’t find what you need? Call ${BUREAU.phone} — we’re happy to help.`}
    >
      <div className="rounded-[24px] border border-[#f2e3bd] bg-white p-6 shadow-soft sm:p-8">
        <h2 className="text-xl font-black tracking-tight text-[#7b102d]">Jump to a topic</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <a key={category.id} href={`#${category.id}`} className="rounded-full border border-[#e5c88d] bg-[#fffaf0] px-4 py-2 text-sm font-semibold text-[#7b102d] transition hover:bg-[#fff3dd]">
              {category.title}
            </a>
          ))}
        </div>
        <div className="mt-6 grid gap-2 border-t border-[#f5e7c6] pt-5 sm:grid-cols-2">
          {QUICK_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="text-sm font-semibold text-[#5a3743] transition hover:text-[#7b102d]">
              → {link.label}
            </a>
          ))}
        </div>
      </div>

      <FaqAccordion categories={CATEGORIES} />

      <LegalSection title="Still have questions?">
        <p>
          We’re reachable at {BUREAU.phone}, {BUREAU.email}, or visit us at {BUREAU.location}. Office assistance is available on all working days for profile help, payment issues, and family meetings.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
