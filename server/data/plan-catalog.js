/**
 * Contract plan catalog — scope PDF §9.
 *
 * SINGLE SOURCE OF TRUTH CHAIN:
 *   server/data/plan-catalog.js  →(seeds once)→  SQLite `membership_plans` table
 * Every runtime consumer (API controllers, landing page, dashboards) reads the
 * database entries; this module is only the seed + emergency fallback and must
 * stay byte-identical to the contract.
 */
const MEMBERSHIP_PACKAGES = {
  Consultation: {
    tier: 'Consultation', name: 'Consultation Package', price: 599,
    durationDays: 30, meetingsAllowed: 1, profilesMin: 0, profilesMax: 0,
    priorityAssistance: false,
    description: 'One-to-one consultation with appointment booking and slot selection.',
    features: ['1-on-1 consultation session', 'Consultation booking', 'Appointment date selection', 'Available time slot selection', 'Online payment', 'Appointment confirmation'],
    popular: false, sortOrder: 1,
  },
  Gold: {
    tier: 'Gold', name: 'Gold Membership', price: 5100,
    durationDays: 60, meetingsAllowed: 3, profilesMin: 20, profilesMax: 20,
    priorityAssistance: false,
    description: 'Best for serious families ready to connect.',
    features: ['60 days validity', '3 Meetings', 'Up to 20 Recommended Profiles', 'Personalized profile recommendations', 'Partner preference based matching', 'Customer dashboard', 'Membership tracking', 'Appointment management', 'Profile / preference updates'],
    popular: true, sortOrder: 2,
  },
  Premium: {
    tier: 'Premium', name: 'Premium Membership', price: 11000,
    durationDays: 90, meetingsAllowed: 5, profilesMin: 25, profilesMax: 30,
    priorityAssistance: true,
    description: 'Complete concierge-level personal assistance.',
    features: ['90 days validity', '5 Meetings', '25–30 Recommended Profiles', 'Priority profile recommendations', 'Personalized matchmaking assistance', 'Partner preference based matching', 'Customer dashboard', 'Membership tracking', 'Appointment management', 'Priority support'],
    popular: false, sortOrder: 3,
  },
};

const UPI_CONFIG = {
  upiId: process.env.UPI_ID || 'shubhsanjog@upi',
  payeeName: process.env.UPI_PAYEE_NAME || 'Shubh Sanjog Matrimony',
};

module.exports = { MEMBERSHIP_PACKAGES, UPI_CONFIG };
