import LegalShell, { BUREAU, LegalList, LegalSection } from '../../components/legal/LegalShell';

export const metadata = {
  title: 'Refund & Cancellation Policy — Shubh Sanjog Marriage Bureau',
  description: 'Refund and cancellation rules for Consultation (₹599), Gold (₹5,100), and Premium (₹11,000) memberships, UTR verification timelines, and the request process.',
};

const PLAN_ROWS = [
  { name: 'Consultation Package', price: '₹599', validity: '30 days', inclusions: '1 consultation meeting • appointment slot booking' },
  { name: 'Gold Membership', price: '₹5,100', validity: '60 days', inclusions: '3 meetings • up to 20 recommended profiles' },
  { name: 'Premium Membership', price: '₹11,000', validity: '90 days', inclusions: '5 meetings • 25–30 recommended profiles • priority assistance' },
];

export default function RefundPage() {
  return (
    <LegalShell
      title="Refund & Cancellation Policy"
      description={`This policy explains when membership fees can and cannot be refunded at ${BUREAU.name}, how UPI payments are verified, and how to raise a refund or cancellation request. Please read it carefully before purchasing a plan.`}
    >
      <LegalSection id="plans" title="1. Membership Plans Covered">
        <div className="overflow-hidden rounded-2xl border border-[#f2d8a8]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#fff8ee] text-[#5f3d49]">
              <tr>
                <th className="px-4 py-3 font-bold">Plan</th>
                <th className="px-4 py-3 font-bold">Price</th>
                <th className="px-4 py-3 font-bold">Validity</th>
                <th className="px-4 py-3 font-bold">Inclusions</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_ROWS.map((plan) => (
                <tr key={plan.name} className="border-t border-[#f2d8a8] bg-white">
                  <td className="px-4 py-3 font-bold">{plan.name}</td>
                  <td className="px-4 py-3 font-semibold">{plan.price}</td>
                  <td className="px-4 py-3">{plan.validity}</td>
                  <td className="px-4 py-3 text-[#5a3743]">{plan.inclusions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Prices are one-time fees for the stated validity period and are inclusive of taxes. Plan features cannot be exchanged between tiers after activation.</p>
      </LegalSection>

      <LegalSection id="utr" title="2. UPI Payment & UTR Verification Timeline">
        <LegalList
          items={[
            'All purchases are made via UPI. After paying, you submit your payment on the platform along with the UTR / transaction reference number and a receipt screenshot.',
            <>Our team manually verifies every UTR against our bank records. Verification is normally completed within <strong>24–48 business hours</strong> of submission.</>,
            <>Your membership activates only after approval — the validity period starts from the activation date, not the payment date.</>,
            'If a UTR does not match our records (wrong amount, duplicate reference, or invalid reference), the submission is rejected with a reason shown in your dashboard; no service starts and nothing is charged beyond what you sent to our UPI ID.',
          ]}
        />
      </LegalSection>

      <LegalSection id="non-refundable" title="3. Non-Refundable Nature After Approval / Service Start">
        <p className="font-semibold text-[#7b102d]">
          All membership fees are strictly non-refundable once the payment has been manually verified, approved, and the membership activated.
        </p>
        <LegalList
          items={[
            'Activation unlocks matchmaking services (recommended profiles, meeting credits, appointment booking) immediately — from that moment the service is deemed to have started.',
            'Change of mind, finding matches unsuitable, personal disagreements, marriage finalised through other means, non-response from recommended members, or relocation are not grounds for a refund.',
            'Unused benefits do not carry value: unutilised meeting credits, unshared profile recommendations, or remaining validity days at expiry are not refundable, transferable, or extendable.',
            'Memberships expire automatically at the end of their validity period. There is no auto-renewal and hence no recurring charge to cancel.',
            'Accounts suspended or terminated for violation of our Terms (fake information, inappropriate behaviour, fraud) forfeit all fees without refund.',
          ]}
        />
      </LegalSection>

      <LegalSection id="cancellation" title="4. Cancellation Rules">
        <LegalList
          items={[
            'Before verification/approval: you may cancel a pending payment submission anytime from your dashboard by contacting us — since no membership has been activated, there is nothing to refund if the UTR was rejected.',
            'After approval: memberships cannot be cancelled midway for a pro-rata refund. The plan simply runs until its validity ends.',
            'Memberships are personal and non-transferable to another person.',
            'Appointments already booked consume a meeting credit; cancelling an appointment does not return the credit once the slot time has passed.',
          ]}
        />
      </LegalSection>

      <LegalSection id="exceptions" title="5. Exceptions — When Refunds Are Considered">
        <p>While fees are otherwise non-refundable, we will review and refund in these specific situations:</p>
        <LegalList
          items={[
            <>
              <strong>Duplicate payment for the same plan:</strong> if two verified payments exist simultaneously for the identical plan and identifier, the extra amount is refunded to the source UPI account within <strong>7–10 business days</strong> of confirmation.
            </>,
            <>
              <strong>Payment approved but service never rendered:</strong> if we approve a payment but are unable to provide the purchased service at all due to a fault on our side, we will refund 100% of that fee case-by-case.
            </>,
            <>
              <strong>Verified bank-side failure:</strong> money debited by your bank without reaching our UPI ID is a bank matter — share the bank reference with us and we will assist with documentation, but recovery happens through your bank.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection id="process" title="6. How to Request a Refund">
        <LegalList
          items={[
            `Email ${BUREAU.email} from your registered contact with: full name, registered mobile/email, plan purchased, payment date, and the UTR / transaction reference.`,
            'Include a short reason and, for duplicate payments, both UTR references.',
            <>You may also call {BUREAU.phone} or visit our office at {BUREAU.location}. Requests are acknowledged within <strong>2 business days</strong> and resolved within <strong>7–10 business days</strong> of verification.</>,
            'Approved refunds are processed only to the original UPI account that made the payment. We never refund to third-party accounts.',
          ]}
        />
      </LegalSection>

      <LegalSection id="chargebacks" title="7. Chargebacks & Price Changes">
        <LegalList
          items={[
            'Please always contact us first before raising a bank chargeback — most issues are UTR mismatches we can resolve within hours.',
            'Fraudulent chargebacks against verified, delivered services may result in account suspension and recovery action.',
            'We may revise plan prices or this policy prospectively at any time; changes never retroactively affect an already-activated membership.',
          ]}
        />
      </LegalSection>

      <LegalSection id="contact" title="8. Contact">
        <p>
          {BUREAU.name} • {BUREAU.location} • {BUREAU.phone} • {BUREAU.email}
        </p>
      </LegalSection>
    </LegalShell>
  );
}
