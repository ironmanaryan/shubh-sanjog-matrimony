# Client Handoff Document

## Project: Shubh Sanjog Matrimony

### Overview
Shubh Sanjog Matrimony is a responsive matrimonial web platform demo designed to showcase a polished customer journey, secure OTP login, profile management, document verification, match discovery, and admin review capabilities.

### Live Demo URLs
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000

### Demo Access

#### Admin Login
- Email: admin@shubhsanjog.com
- OTP: 123456

#### Test Customer Login
- Email: neha.sharma@example.com
- OTP: generated at runtime by the app demo OTP API

### Features Included
- Public landing page with modern hero, filters, and featured profiles
- Responsive navigation and legal footer links
- OTP-based login and registration flow
- Customer dashboard with overview cards
- Multi-step biodata builder for personal, education, family, and preferences data
- Document and Kundli upload center
- Recommended matches listing with filters
- Shortlist and express-interest actions
- Admin document verification workflow with approve/reject actions
- JWT-protected APIs with SQLite-backed persistence

### Project Architecture

#### Frontend
- Next.js App Router
- Tailwind CSS
- TypeScript
- Lucide React icons

#### Backend
- Node.js + Express
- JWT middleware
- SQLite database
- Multer-based file upload handling

### Important Files
- `app/page.tsx` — public landing page
- `app/login/page.tsx` — OTP login page
- `app/customer/page.tsx` — customer dashboard
- `app/customer/biodata/page.tsx` — biodata builder
- `app/customer/documents/page.tsx` — document upload center
- `app/customer/recommended/page.tsx` — recommended matches page
- `app/admin/documents/page.tsx` — admin document verification UI
- `server/index.js` — API bootstrapping
- `server/routes/*.js` — API routes
- `server/controllers/*.js` — route logic
- `server/db.js` — SQLite schema and helpers
- `server/scripts/seed-demo.js` — demo seeding script

### Local Run Instructions

#### Backend
```bash
cd <project-root>
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
- [ ] Database: PostgreSQL / SQLite for prototype; production recommendation: PostgreSQL
- [ ] Environment variables added securely

#### Messaging and Authentication
- [ ] Twilio API account configured
- [ ] SMS OTP gateway keys added to backend env
- [ ] JWT secret set to secure production value
- [ ] Rate limiting and validation layer configured

#### Content / Legal
- [ ] Privacy policy approved
- [ ] Terms and conditions finalized
- [ ] Community guidelines and user consent flow added
- [ ] Support contact and escalation process documented

### Client Notes
This is a high-quality working MVP/demo that demonstrates the intended user journey and admin workflows. For production release, the next strategic steps are to replace demo OTP logic with a real SMS gateway, add real role-based authentication, deploy to production hosting, and integrate cloud storage for profile documents and photographs.
