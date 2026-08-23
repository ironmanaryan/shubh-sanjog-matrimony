import LegalShell, { BUREAU, LegalList, LegalSection } from '../../components/legal/LegalShell';

export const metadata = {
  title: 'Privacy Policy — Shubh Sanjog Marriage Bureau',
  description: 'How Shubh Sanjog Matrimony protects your biodata and private documents (Aadhaar, Kundli) with signed-URL access, admin-controlled masking, and strict no-third-party sharing.',
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      description={`${BUREAU.name} handles some of the most personal information a family can share — biodata, horoscopes, and identity documents. This policy explains exactly what we collect, how it is protected, who can see it, and the strict rules that prevent it from ever being shared with third parties.`}
    >
      <LegalSection id="commitment" title="1. Our Commitment">
        <p>
          We follow strict data-protection guidelines designed for matrimonial data: minimum collection, private storage, role-based staff access, masked display of sensitive details until they are meant to be revealed, and an absolute prohibition on selling or sharing your data with marketers, advertisers, or any third party.
        </p>
      </LegalSection>

      <LegalSection id="collection" title="2. Information We Collect">
        <LegalList
          items={[
            <><strong>Account details:</strong> your mobile number or email address (used as your login identifier), account creation date, and system-assigned internal identifiers.</>,
            <><strong>Biodata you provide:</strong> personal details (name, date of birth, height, religion, caste, mother tongue, marital status, city), education and profession, family details, lifestyle fields, and your partner preferences.</>,
            <><strong>Private documents you upload:</strong> identity proofs (which may include Aadhaar or other government ID), address proofs, educational or income certificates, photographs, and Kundli / horoscope files.</>,
            <><strong>Payment information:</strong> the plan purchased, amount, UPI ID paid from, UTR / transaction reference, and the payment receipt screenshot you submit. We never collect or store card numbers or banking passwords.</>,
            <><strong>Service activity:</strong> shortlists, interest requests sent/received with their status, appointments booked, notifications, and membership usage counters (meetings used, profiles shared).</>,
          ]}
        />
      </LegalSection>

      <LegalSection id="storage" title="3. How Your Data Is Stored & Protected">
        <LegalList
          items={[
            <>Uploaded documents are stored in <strong>private server directories that are not publicly reachable</strong> — there is no public URL for any Aadhaar, kundli, photograph, receipt, or other document.</>,
            'Every document download is authorised through token-protected APIs; requests must carry a valid login session belonging to the owner (or an authorised staff member).',
            'All platform APIs are protected by signed session tokens, and passwords/OTPs are never stored in plain text.',
            'Access to customer data by our team follows role-based permissions: senior administrators have full access needed to verify profiles and payments; limited roles can only view queues without approving anything.',
            'We apply strict data isolation: your account can only ever read and modify your own biodata, documents, interests, appointments, and payments — never another member’s.',
          ]}
        />
      </LegalSection>

      <LegalSection id="documents" title="4. Private Document Handling (Aadhaar, Kundli & Photographs)">
        <LegalList
          items={[
            <><strong>Purpose limitation:</strong> identity documents are collected solely for profile verification by our admin team. They are never displayed to other members and never included in shared profiles.</>,
            <><strong>Kundli / horoscope:</strong> visible only to you and the verifying administrator. Matchmaking uses preference filters (age, religion, caste, profession, location); we do not publish horoscope details to other members.</>,
            <><strong>Signed URL access:</strong> when a document needs to be opened or downloaded, our server issues a cryptographically signed, short-lived link (valid for about 5 minutes) that is bound to that exact file and to your session. The link expires automatically, cannot be forwarded or bookmarked for later use, and every issue of a link re-checks that you are still allowed to see the file.</>,
            <><strong>No public exposure:</strong> documents are streamed privately on demand; they cannot appear in search results, be hot-linked from other sites, or be accessed after expiry of the signed grant.</>,
          ]}
        />
      </LegalSection>

      <LegalSection id="masking" title="5. Admin-Controlled Masking & Privacy Toggles">
        <LegalList
          items={[
            'Your photograph and phone number are masked by default. They are unmasked for another member only after (a) our admin approves your profile, or (b) an interest between you and that member is mutually accepted — whichever the privacy rules allow first.',
            'You keep control even after approval: privacy toggles in your dashboard let you hide your photo or phone number at any time, regardless of verification status.',
            'Contact details such as email addresses are never displayed to other members; all introductions happen inside the platform.',
            'Administrators may add internal notes to a profile during review — these notes are strictly internal and are never shown to customers.',
          ]}
        />
      </LegalSection>

      <LegalSection id="no-sharing" title="6. Strict No-Third-Party Sharing">
        <p className="font-semibold text-[#7b102d]">
          We do not sell, rent, trade, or share your personal data with third parties. Period.
        </p>
        <LegalList
          items={[
            'No sharing with advertisers, marketing agencies, lead brokers, data-analytics firms, affiliate networks, or any unrelated business — now or in the future.',
            'Biodata is shared with other members only as masked/limited views produced by the matching system itself; raw biodata exports are not provided.',
            'The only exceptions where data may be disclosed are: (a) where disclosure is required by Indian law, court order, or a lawful request from police or regulatory authorities; (b) to our own payment-verification and hosting service providers strictly to operate the platform, bound by confidentiality; and (c) with your explicit consent for a specific purpose.',
            'Payment receipts (including any UPI details visible on them) are seen only by you and the administrators verifying your transaction.',
          ]}
        />
      </LegalSection>

      <LegalSection id="payments" title="7. Payment Data">
        <LegalList
          items={[
            'UPI payments are verified manually using the UTR reference you submit; this record contains only the plan, amount, payer UPI ID, UTR, and receipt image.',
            'Receipts are stored privately like all other documents and are retained for accounting and dispute-resolution purposes.',
            'We do not store banking credentials, card numbers, CVVs, or net-banking logins anywhere on the platform.',
          ]}
        />
      </LegalSection>

      <LegalSection id="retention" title="8. Retention & Deletion">
        <LegalList
          items={[
            'Your biodata and documents remain while your account is active so we can continue matchmaking for you.',
            <>You may request deletion of your account, biodata, and documents anytime by emailing <a className="font-semibold text-[#7b102d] underline" href={BUREAU.emailHref}>{BUREAU.email}</a>. We will remove them within 30 days, except records we must retain for legal, accounting, or fraud-prevention purposes (e.g., payment verification records).</>,
            'Expired memberships do not entitle us to keep your data longer than needed; inactive accounts may be archived and later deleted after notice.',
          ]}
        />
      </LegalSection>

      <LegalSection id="cookies" title="9. Local Storage, Cookies & Communications">
        <LegalList
          items={[
            'We use minimal browser storage: your session login token is kept locally on your device so you stay signed in. We do not run advertising or cross-site tracking cookies.',
            'OTP codes are sent to your registered number/email for login. Please never share OTPs — our team will never ask for them over a call.',
            'Platform notifications (new match assigned, interest received/accepted, appointment confirmed, payment updates) are delivered inside your dashboard.',
          ]}
        />
      </LegalSection>

      <LegalSection id="rights" title="10. Your Rights & Contact">
        <LegalList
          items={[
            'Access and correct your biodata, preferences, and documents anytime from your dashboard.',
            'Withdraw consent and request account + data deletion as described above.',
            'Raise a privacy concern or report misuse — we investigate every complaint.',
          ]}
        />
        <p>
          Grievances and privacy questions: {BUREAU.email} • {BUREAU.phone} • {BUREAU.location}.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
