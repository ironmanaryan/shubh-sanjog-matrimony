// Realistic demo data served when the Express API (default
// http://localhost:4000/api) is unreachable, so the customer surface never
// renders broken/empty states during offline development or demos.
//
// Shapes mirror the API response envelopes consumed by the customer pages:
//   GET /customer/profile   -> { profile }
//   GET /dashboard/stats    -> { stats: { membership, recommendedProfiles } }
//   GET /documents          -> { documents }
//   GET /appointments/my    -> { appointments }
//   GET /notifications      -> { notifications }
//   GET /profile            -> { profile: { personal, education, family, preferences, status } }

const dayMs = 86_400_000;

export const MOCK_PROFILE_RESPONSE = {
  profile: {
    personal: {
      firstName: 'Aarohi',
      lastName: 'Mehta',
      gender: 'Female',
      dob: '1996-11-14',
      height: '5ft 4in',
      religion: 'Hindu',
      caste: 'Brahmin',
      subCaste: 'Gaur',
      motherTongue: 'Hindi',
      maritalStatus: 'Never Married',
      city: 'Jaipur',
      state: 'Rajasthan',
      mobile: '+91 98765 43210',
      email: 'aarohi.mehta@example.com',
      foodPreference: 'Vegetarian',
      hobbies: 'Classical dance, reading, pottery',
      interests: 'Travel, yoga, interior design',
      about:
        'Warm and family-oriented professional who values tradition while embracing modern life. Looking for a kind, ambitious partner.',
    },
    education: {
      highestQualification: 'MBA',
      educationDetails: 'MBA (Finance), University of Rajasthan',
      profession: 'Product Manager',
      jobType: 'Private Job',
      company: 'Infosys',
      annualIncome: '₹18 LPA',
      workLocation: 'Bengaluru',
      experience: '6 years',
    },
    family: {
      fatherName: 'Mr. Rajesh Mehta',
      fatherOccupation: 'Chartered Accountant',
      motherName: 'Mrs. Sunita Mehta',
      motherOccupation: 'School Principal',
      numberOfBrothers: 1,
      numberOfSisters: 0,
      familyType: 'Nuclear',
      familyStatus: 'Middle Class',
      familyLocation: 'Jaipur',
      otherInfo: 'Grandparents live in Udaipur; close-knit family with annual gatherings.',
    },
    preferences: {
      preferredGender: 'Male',
      minAge: 28,
      maxAge: 34,
      minHeight: '5ft 8in',
      maxHeight: '6ft 2in',
      religion: 'Hindu',
      caste: 'Brahmin',
      motherTongue: 'Hindi',
      maritalStatus: 'Never Married',
      education: 'Post Graduate',
      profession: 'Any reputable profession',
      incomeRange: '₹15 LPA and above',
      location: 'Bengaluru, Jaipur, Delhi NCR',
      country: 'India',
      nriPreference: false,
      manglikPreference: "Don't Know",
      foodPreference: 'Vegetarian',
      otherRequirements: 'Family-oriented, respectful of traditions.',
      aboutPartner:
        'Someone grounded and caring who believes in partnership, laughter and lifelong learning.',
    },
    profileCompletion: 82,
    status: 'Under Review',
  },
};

export const MOCK_STATS_RESPONSE = {
  stats: {
    membership: {
      tier: 'Gold',
      active: true,
      startedAt: Date.now() - 12 * dayMs,
      expiresAt: Date.now() + 18 * dayMs,
      meetingsAllowed: 6,
      meetingsUsed: 2,
      meetingsLeft: 4,
      profilesAllowed: 25,
      profilesShared: 9,
      profilesRemaining: 16,
    },
    recommendedProfiles: [
      { id: 'demo-match-1', name: 'Rohan Kapoor' },
      { id: 'demo-match-2', name: 'Vikram Singhania' },
      { id: 'demo-match-3', name: 'Aditya Sharma' },
      { id: 'demo-match-4', name: 'Kabir Malhotra' },
    ],
    matchesRemaining: 4,
  },
};

export const MOCK_DOCUMENTS_RESPONSE = {
  documents: [
    { id: 'demo-doc-1', status: 'Approved', documentType: 'identity', originalName: 'aadhaar-front.pdf' },
    { id: 'demo-doc-2', status: 'Pending', documentType: 'kundli', originalName: 'birth-chart.pdf' },
  ],
};

export const MOCK_APPOINTMENTS_RESPONSE = {
  appointments: [
    { id: 'demo-appt-1', date: new Date(Date.now() + 3 * dayMs).toISOString().slice(0, 10), time: '10:30 AM', type: 'Consultation', notes: 'Discuss shortlisted matches.', status: 'Booked' },
    { id: 'demo-appt-2', date: new Date(Date.now() - 9 * dayMs).toISOString().slice(0, 10), time: '09:00 AM', type: 'Profile Review', status: 'Completed' },
  ],
};

export const MOCK_NOTIFICATIONS_RESPONSE = {
  notifications: [
    { id: 'demo-notif-1', type: 'new_match_assigned', at: Date.now() - 1 * dayMs },
    { id: 'demo-notif-2', type: 'document_approved', at: Date.now() - 3 * dayMs },
    { id: 'demo-notif-3', type: 'interest_received', at: Date.now() - 5 * dayMs },
  ],
};

// Seed for the biodata stepper when the saved profile cannot be loaded.
export const MOCK_BIODATA = MOCK_PROFILE_RESPONSE.profile;

// Default privacy switches used when /customer/privacy cannot be reached.
export const MOCK_PRIVACY = { hidePhoto: false, hidePhone: false };
