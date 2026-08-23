# Client Handoff Document

## Project: Shubh Sanjog Matrimony

### Overview
Shubh Sanjog Matrimony is a responsive matrimonial web platform designed to deliver a polished customer journey with real OTP login, profile management, document verification, manual UPI payment approval, match discovery, and admin review capabilities.

### Local URLs
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000

### Access

There are no demo accounts or seeded profiles. Every account is created through the real Registration → OTP flow:

#### Admin Login
- Use any identifier listed in `ADMIN_EMAILS` in `server/.env` (e.g. `aryansadanshiv8@gmail.com`) — these are force-granted `role: admin` on server boot so `/admin` opens immediately.
- OTP is delivered by the configured provider (outside production, without a provider, the API returns a dev master code).

#### Customer Login
- Register at `/register` with a mobile number → verify OTP → complete the biodata funnel.

### Features Included
- Public landing page with modern hero, filters, and plan cards
- Responsive navigation and legal footer links
- Real OTP-based login and registration flow
- Customer dashboard with overview cards and onboarding tracker
- Multi-step biodata builder for personal, education, family, and preferences data
- Document and Kundli upload center
- Recommended matches listing with filters
- Shortlist and express-interest actions
- Manual UPI payments — QR/UPI ID checkout, UTR + screenshot submission, admin verification queue; approval activates membership tier, validity and credits in MongoDB
- Admin document verification workflow with approve/reject actions
- JWT-protected APIs with MongoDB persistence (`MONGODB_URI`)

### Project Architecture

#### Frontend
- Next.js App Router
- Tailwind CSS
- TypeScript
- Lucide React icons

#### Backend
- Node.js + Express
- JWT middleware + RBAC (admin / relationship_manager / staff / customer)
- MongoDB via Mongoose (SQLite remains a legacy local-dev fallback only)
- Multer-based file upload handling
- Pluggable OTP providers (Twilio / Fast2SMS / MSG91 / SMTP)

### Important Files
- `app/page.tsx` — public landing page
- `app/login/page.tsx` — OTP login page
- `app/customer/page.tsx` — customer dashboard
- `app/customer/biodata/page.tsx` — biodata builder
- `app/customer/documents/page.tsx` — document upload center
- `app/customer/membership/page.tsx` — plan selection + manual UPI checkout
- `app/admin/page.tsx` — consolidated admin panel (profiles / documents / payments / matchmaking)
- `server/index.js` — API bootstrapping
- `server/routes/*.js` — API routes
- `server/controllers/*.js` — route logic
- `server/db-mongo.js` — Mongoose schemas and persistence helpers
- `server/data/plan-catalog.js` — canonical plans + UPI destination config

### Local Run Instructions

#### Backend
```bash
cd <project-root>
# configure server/.env first (MONGODB_URI, JWT_SECRET, ADMIN_EMAILS, UPI_ID)
node server/index.js
```

#### Frontend
```bash
cd <project-root>
npx next dev -H 0.0.0.0 -p 3000
```

### Production Requirements Checklist

#### Domain
- [ ] Final domain selected and registered
- [ ] SSL certificate configured
- [ ] Custom branding and metadata finalized

#### Hosting
- [ ] Frontend: Vercel
- [ ] Backend: Render / Railway / VPS
- [ ] Database: managed MongoDB Atlas cluster (`MONGODB_URI`)
- [ ] Environment variables added securely

#### Messaging and Authentication
- [ ] Twilio / Fast2SMS / MSG91 account configured for real OTP delivery
- [ ] SMS OTP gateway keys added to backend env
- [ ] JWT secret set to secure production value
- [ ] Rate limiting and validation layer configured

#### Content / Legal
- [ ] Privacy policy approved
- [ ] Terms and conditions finalized
- [ ] Community guidelines and user consent flow added
- [ ] Support contact and escalation process documented

### Client Notes
This is a working MVP that implements the intended user journey end to end on real MongoDB data: registration → OTP → biodata → family details → partner preferences → document upload → admin review → manual UPI payment → admin payment approval → membership activation → matching → appointments → feedback/renewal.
