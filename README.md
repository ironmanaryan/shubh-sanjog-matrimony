# Shubh Sanjog Matrimony

A full-stack matrimonial web application for Shubh Sanjog Marriage Bureau built with Next.js 16 (App Router), Tailwind CSS, TypeScript, and a Node.js/Express API with JWT-based auth, MongoDB persistence, real OTP verification, manual UPI payment verification, and admin/customer workflows.

## Business Scope (official PDF)

- **Pricing tiers** (single source of truth: MongoDB `membershipplans` collection, seeded from `server/data/plan-catalog.js`, served at `GET /api/payments/plans`):
  - **Consultation Package** — ₹599 (1-on-1 session, appointment booking, slot selection)
  - **Gold Membership** — ₹5,100 (60 days, 3 meetings, up to 20 recommended profiles)
  - **Premium Membership** — ₹11,000 (90 days, 5 meetings, 25–30 recommended profiles, priority assistance)
- **Manual UPI payments (no payment gateway)**: customer scans the business UPI QR / pays to the UPI ID, submits the UTR + payment screenshot; every payment is stored in MongoDB as *Pending Verification* until an admin verifies the proof and approves it (approval automatically activates the membership tier, validity dates and credits in MongoDB).
- **Profile review workflow**: Draft → Submitted → Under Review → Approved / Rejected with reviewer notes and notifications.
- **Privacy**: photos and contact details stay masked until the profile is admin-approved or an interest is accepted (customer toggles can keep them private regardless).

## Project Overview

This project includes:
- Public website UI with DB-driven plan cards ("Get Started" opens UPI checkout)
- Real OTP-based passwordless login/registration issuing JWTs (Twilio / Fast2SMS / MSG91 / SMTP; dev master code outside production)
- Customer dashboard with membership usage tracking (meetings/profiles/expiry)
- Biodata builder covering Personal Details, Education & Career, Lifestyle, Family Information, Partner Preferences (+ free-text "What I am looking for in my partner")
- Secure private file management for Identity/Address Proofs, Educational Certificates, Income Proofs, Photographs, and Horoscope/Kundli (never public URLs — streamed via authenticated endpoints)
- Recommended matches with preference filters, shortlist, and interest lifecycle
- Consolidated Admin Panel (`/admin`) with tabs: Overview, Profile Review, Document Verification, UPI Payment Approvals, Matchmaking Assignment
- MongoDB-backed persistence (`process.env.MONGODB_URI`) and JWT-protected APIs

## Local Development Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Configure the backend

Copy `server/.env.example` to `server/.env` and set:

- `MONGODB_URI` — MongoDB connection string (all users, profiles, documents, appointments, payments, memberships, OTPs persist here)
- `JWT_SECRET` — a strong secret
- `ADMIN_EMAILS` — identifiers force-granted the `admin` role on server boot so `/admin` access works immediately (e.g. `aryansadanshiv8@gmail.com`)
- `UPI_ID` / `UPI_PAYEE_NAME` — business UPI destination shown on checkout
- Optional OTP providers: `TWILIO_*`, `FAST2SMS_*`, `MSG91_*`, `SMTP_*`

### 3) Start the backend (Express API)

```bash
node server/index.js
```

The backend runs on:
- http://localhost:4000

On boot it connects to MongoDB, seeds the canonical plans and promotes the configured admin identifiers to `role: admin`. New customer sign-ups start with a completely fresh profile — no demo data is seeded.

### 4) Start the frontend (Next.js)

```bash
npx next dev -H 0.0.0.0 -p 3000
```

The frontend runs on:
- http://localhost:3000

## Sign-in

There are no demo accounts or hardcoded profiles. Every account is created through Registration → OTP verification:

1. Enter your mobile number (or email) at `/register` or `/login`
2. Verify the OTP delivered by the configured provider
3. Outside production with no provider configured, the API returns a dev master code (`123456`) in the response for convenience
4. Admins: sign in with an identifier listed in `ADMIN_EMAILS`, then open `/admin`

## Main Routes

### Frontend
- `/` — Public home page (plans rendered server-side from MongoDB)
- `/login` — OTP login (issues JWT; admin logins route to `/admin`)
- `/register` — OTP registration (redirects to biodata builder)
- `/customer` — Customer dashboard
- `/customer/biodata` — Biodata builder + Submit for Review
- `/customer/documents` — Documents & Kundli center (incl. photograph upload)
- `/customer/appointments` — Consultation/meeting booking with slot selection
- `/customer/recommended` — Matches page (privacy-aware photos/contacts)
- `/customer/membership` — Plan selection, UPI checkout, payment tracking
- `/admin` — Consolidated admin panel (Overview / Profile Review / Documents / Payments / Matchmaking tabs)

### Backend API (all JWT-protected via `Authorization: Bearer ${token}` except auth + health)
- `GET /api/health`
- `POST /api/auth/send-otp` · `POST /api/auth/verify-otp`
- `GET|PUT /api/profile` · `POST /api/profile/personal|education|family|preferences` · `POST /api/profile/submit`
- `GET|PUT /api/customer/profile` · `GET|PUT /api/customer/privacy`
- `POST /api/documents/upload` · `GET /api/documents` · `GET /api/documents/:id`
- `GET /api/dashboard/stats`
- `GET /api/matches/search` · `GET|POST /api/matches/shortlist` · `POST /api/matches/interest` · `GET /api/matches/interests` · `POST /api/matches/interest/respond`
- `GET /api/appointments/slots` · `GET /api/appointments/my` · `POST /api/appointments/book`
- `GET /api/payments/plans` · `POST /api/payments` (UTR + receipt) · `GET /api/payments/mine`
- `GET /api/notifications`
- Admin: `GET /api/admin/stats` · `GET /api/admin/customers|candidates` · `GET /api/admin/profiles?status=` · `POST /api/admin/profiles/approve|reject|request-changes` · `GET /api/admin/documents` · `POST /api/admin/documents/approve|reject` · `GET /api/admin/payments` · `POST /api/admin/payments/approve|reject` · `GET /api/admin/payments/:id/receipt` · `GET /api/admin/match-assignments` · `POST /api/admin/match-assignment`

## Verification

```bash
npx tsc --noEmit          # zero compilation errors
node server/scripts/smoke_payments.js   # 32 end-to-end checks (auth, plans ₹599/₹5100/₹11000, UPI flow, review workflow, privacy masking)
```

## Features Completed

### Public Website
- Responsive landing page with hero, filters, plan cards, and featured profiles
- Matrimonial branding using maroon, gold, and white palette
- Navbar and footer with business contact info
- Consultation and membership sections

### Customer Experience
- OTP-based registration/login flow
- JWT-protected dashboard access
- Profile completion and personal details entry
- Education/career, family, and partner preferences pages
- Documents and Kundli management center
- Recommended matches listing with filters, shortlist, and interest actions
- Membership and dashboard overview screens

### Admin Experience
- Admin dashboard overview
- Document verification queue
- Approve/reject actions with rejection reason input
- Admin-only JWT role enforcement for sensitive routes

### Backend and Data
- Express API architecture
- JWT authentication middleware
- MongoDB persistence (Mongoose) for users, profiles, documents, appointments, payments and memberships
- Real-time CRUD — every mutation writes to MongoDB inside the request that performs it
- Notification feed support

## Client Requirements Checklist for Production

### Domain and Branding
- [ ] Final business domain name decided (e.g., shubhsanjog.com)
- [ ] Legal business registration and contact details confirmed
- [ ] Brand assets: logo, favicon, social cards, and email signature

### Hosting and Deployment
- [ ] Frontend hosting: Vercel
- [ ] Backend hosting: Render / Railway / VPS
- [ ] Production environment variables configured
- [ ] HTTPS enabled with custom domain
- [ ] CDN and image optimization for profile photos

### SMS OTP / Notification API
- [ ] Twilio or equivalent SMS provider account setup
- [ ] OTP template approved
- [ ] API keys added to environment variables
- [ ] Production sender ID and message service configured

### Security and Compliance
- [ ] Strong JWT secret in production
- [ ] Role-based user authorization hardened
- [ ] Rate limiting and request validation enabled
- [ ] Database backups configured
- [ ] GDPR/privacy policy and consent flow implemented

### Optional Production Enhancements
- [ ] Real user onboarding and KYC verification
- [ ] AI-powered matchmaking engine
- [ ] Cloud object storage for documents (AWS S3 / Cloudinary)
- [ ] Admin role management with proper RBAC model

## Notes

This repository is a working demo/prototype for client presentation and product validation. It is not yet production-hardened for real-world matrimonial operations, but it demonstrates the complete user journey, admin review flow, and API structure required for an MVP.
