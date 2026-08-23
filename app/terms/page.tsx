import LegalShell, { BUREAU, LegalList, LegalSection } from '../../components/legal/LegalShell';

export const metadata = {
  title: 'Terms & Conditions — Shubh Sanjog Marriage Bureau',
  description: 'Terms governing membership, eligibility, account security, profile verification, and acceptable conduct on Shubh Sanjog Matrimony.',
};

const PLANS = [
  { name: 'Consultation Package', price: '₹599', validity: '30 days', highlights: '1 consultation meeting with appointment booking' },
  { name: 'Gold Membership', price: '₹5,100', validity: '60 days', highlights: '3 meetings • up to 20 recommended profiles' },
  { name: 'Premium Membership', price: '₹11,000', validity: '90 days', highlights: '5 meetings • 25–30 recommended profiles • priority assistance' },
];

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms & Conditions"
      description={`These Terms & Conditions govern your use of ${BUREAU.brand} and the matchmaking services provided by ${BUREAU.name}, Fatehabad, Haryana. By registering, purchasing a membership, or using any part of this platform, you agree to these terms in full.`}
    >
      <LegalSection id="eligibility" title="1. User Eligibility">
        <p>
          Membership is strictly restricted to individuals who are legally qualified to marry under Indian law and who meet the following minimum age requirements:
        </p>
        <LegalList
          items={[
            <strong key="f">Female members must be at least 18 (eighteen) years of age.</strong>,
            <strong key="m">Male members must be at least 21 (twenty-one) years of age.</strong>,
            'You must be unmarried, widowed, or legally divorced. Members whose divorce proceedings are not finalised must disclose this clearly in their biodata.',
            'You must be of sound mind and not disqualified from marriage by any law applicable in India, including the Hindu Marriage Act, 1955, the Special Marriage Act, 1954, or personal laws relevant to your religion.',
            <>
              By registering you confirm you are registering for yourself, with genuine intent to seek a life partner, and that all age and status declarations are true. Accounts found violating eligibility rules will be{' '}
              <strong>terminated immediately without refund</strong>.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection id="membership-rules" title="2. Matrimonial Membership Rules">
        <p>
          We offer three paid plans. Prices are inclusive of all taxes and are set out below; detailed inclusions are shown on our Membership Plans page.
        </p>
        <div className="overflow-hidden rounded-2xl border border-[#f2d8a8]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#fff8ee] text-[#5f3d49]">
              <tr>
                <th className="px-4 py-3 font-bold">Plan</th>
                <th className="px-4 py-3 font-bold">Price</th>
                <th className="px-4 py-3 font-bold">Validity</th>
                <th className="px-4 py-3 font-bold">Key inclusions</th>
              </tr>
            </thead>
            <tbody>
              {PLANS.map((plan) => (
                <tr key={plan.name} className="border-t border-[#f2d8a8] bg-white">
                  <td className="px-4 py-3 font-bold">{plan.name}</td>
                  <td className="px-4 py-3 font-semibold">{plan.price}</td>
                  <td className="px-4 py-3">{plan.validity}</td>
                  <td className="px-4 py-3 text-[#5a3743]">{plan.highlights}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <LegalList
          items={[
            'A membership begins only after your UPI payment has been manually verified by our team and approved; the plan period runs from the date of activation.',
            'Meeting credits and recommended-profile allowances are per-membership limits, are non-transferable between accounts, and do not carry over after expiry.',
            'Recommended profiles are shared based on your stated partner preferences and availability of compatible profiles on the platform; we do not guarantee any minimum number of matches, responses, or a successful marriage.',
            'Memberships are personal to the registered member and their family’s use for that member’s alliance only. Reselling, sharing, scraping, or bulk-exporting profiles is prohibited.',
            'Expressing interest, shortlisting, and appointment booking features must be used respectfully; repeated one-sided interests or slot-blocking may be limited by the admin team.',
            'Membership fees are non-refundable once verified and activated — please read our Refund & Cancellation Policy before purchasing.',
          ]}
        />
      </LegalSection>

      <LegalSection id="account-security" title="3. Account Registration & Security">
        <LegalList
          items={[
            'Accounts are created via OTP verification of your mobile number or email address. You are responsible for keeping access to your device and number secure.',
            <>You must provide accurate, current, and complete information during registration and in your biodata, and keep it updated. Misrepresentation of identity, age, marital status, income, or qualification is grounds for immediate termination.</>,
            'One account per person: creating duplicate or fake profiles is prohibited and will result in permanent suspension of all linked accounts.',
            'Do not share your account access, OTPs, or device with unrelated third parties. Any activity carried out through your account will be deemed to be authorised by you.',
            <>Notify us immediately at <a className="font-semibold text-[#7b102d] underline" href={BUREAU.emailHref}>{BUREAU.email}</a> if you suspect unauthorised access to your account.</>,
          ]}
        />
      </LegalSection>

      <LegalSection id="verification" title="4. Profile Verification Disclaimer">
        <LegalList
          items={[
            'Our admin team manually reviews submitted biodata and supporting documents (such as identity proofs and kundli/horoscope) before approving a profile. Approved profiles display a “Verified Profile” badge.',
            <>
              The <strong>“Verified Profile” badge means only that our team has reviewed the submitted details and documents</strong>. It is <strong>not</strong> a government certification, a background check, a caste/religion certificate, or a guarantee of any user’s character, financial status, or intentions.
            </>,
            'While we take reasonable precautions, we rely on users to supply truthful information and cannot warrant that every detail on any profile is accurate. You must independently verify important claims before proceeding with any alliance.',
            'We may reject any biodata or document at our discretion, request changes, or withdraw verification at any time if we receive credible complaints or discover inconsistencies.',
            'Profile photographs and contact numbers remain masked until the profile is approved by our team or an interest between two members is mutually accepted, as described in our Privacy Policy.',
          ]}
        />
      </LegalSection>

      <LegalSection id="conduct" title="5. Zero-Tolerance Policy on Inappropriate Behaviour">
        <p className="font-semibold text-[#7b102d]">
          {BUREAU.name} maintains an absolute zero-tolerance policy against inappropriate, abusive, or illegal behaviour. Violations lead to immediate suspension or termination, forfeiture of membership fees, and reporting to law-enforcement authorities where required.
        </p>
        <LegalList
          items={[
            'No harassment, stalking, obscene, defamatory, or sexually explicit communication with other members in any channel.',
            'No misrepresentation of identity, marital status, employment, or intention to marry; no bigamous or fraudulent alliances.',
            'No demand or solicitation of money, gifts, dowry, or financial favours from other members or their families. Dowry-related demands are unlawful and will be reported.',
            'No uploading of content you do not have the right to share — including photographs of other people, morphed images, or forged documents.',
            'No commercial solicitation, chain messages, spam, or use of member contact details for marketing purposes.',
            'No attempts to bypass privacy masking, scrape data, or access another member’s documents or account.',
          ]}
        />
        <p>Reports of misconduct can be made to {BUREAU.email} or {BUREAU.phone}. We review every complaint and may involve both families and, where warranted, the police.</p>
      </LegalSection>

      <LegalSection id="interactions" title="6. Member Interactions & Personal Safety">
        <LegalList
          items={[
            'Alliances proceed at the sole discretion of members and their families. Our role is limited to introducing and facilitating; we do not participate in, approve, or guarantee any meeting or marriage.',
            'We strongly recommend that early meetings occur in public places with family members informed, and that financial or document disclosures happen only after families have independently verified each other.',
            `${BUREAU.name} is not liable for the conduct of members, outcomes of meetings, or any loss arising from interactions between members.`,
          ]}
        />
      </LegalSection>

      <LegalSection id="payments" title="7. Payments">
        <LegalList
          items={[
            'Payments are collected via UPI to our official UPI ID shown at checkout. We never ask for card details, net-banking passwords, or OTPs over phone calls.',
            'Every payment requires a UTR / transaction reference which our team verifies manually against our bank records; memberships activate only after approval.',
            'Submitting false UTR references or another person’s payment proof is fraud and leads to permanent ban and legal action.',
          ]}
        />
      </LegalSection>

      <LegalSection id="termination" title="8. Suspension, Termination & Changes">
        <LegalList
          items={[
            'We may suspend or terminate any account that breaches these terms, provides false information, or receives verified complaints — with or without prior notice.',
            'You may stop using the platform at any time; membership fees already verified and activated are non-refundable (see the Refund & Cancellation Policy).',
            'We may update these terms from time to time; the “Last updated” date above will change and continued use constitutes acceptance of the revised terms.',
          ]}
        />
      </LegalSection>

      <LegalSection id="liability-law" title="9. Limitation of Liability & Governing Law">
        <LegalList
          items={[
            'To the maximum extent permitted by law, our aggregate liability for any claim relating to the services is limited to the membership fee you paid in the twelve months preceding the claim.',
            'We are not liable for indirect, incidental, or consequential losses, including emotional distress, reputational harm, or losses arising from member-to-member interactions.',
            'These terms are governed by the laws of India. Courts at Fatehabad, Haryana shall have exclusive jurisdiction over any dispute.',
          ]}
        />
      </LegalSection>

      <LegalSection id="contact" title="10. Contact Us">
        <p>
          For questions about these Terms, write to {BUREAU.email}, call {BUREAU.phone}, or visit us at {BUREAU.location}.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
