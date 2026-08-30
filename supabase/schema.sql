-- Supabase PostgreSQL schema — migrated from MongoDB (Mongoose) + SQLite
-- Run this in Supabase SQL Editor: https://culcgbqeengmhdlbfwuq.supabase.co

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- users (replaces Mongo User collection / SQLite users table)
create table if not exists users (
  id text primary key,
  identifier text unique not null,
  email text,
  full_name text,
  role text default 'customer' check (role in ('admin','relationship_manager','staff','customer')),
  created_at bigint default extract(epoch from now())*1000,
  deleted_at bigint
);
create index if not exists idx_users_identifier on users (identifier);
create index if not exists idx_users_role on users (role);

-- matrimonial_profiles
create table if not exists matrimonial_profiles (
  user_id text primary key references users(id) on delete cascade,
  personal jsonb default '{}'::jsonb,
  education jsonb default '{}'::jsonb,
  family jsonb default '{}'::jsonb,
  preferences jsonb default '{}'::jsonb,
  privacy jsonb default '{}'::jsonb,
  profile_completion integer default 0,
  status text default 'Draft' check (status in ('Draft','Submitted','Under Review','Approved','Rejected')),
  review_note text,
  submitted_at bigint,
  reviewed_at bigint,
  updated_at bigint
);
create index if not exists idx_profiles_status on matrimonial_profiles (status);

-- membership_plans (single source of truth — seeded from plan-catalog.js)
create table if not exists membership_plans (
  tier text primary key,
  name text,
  price integer not null,
  duration_days integer not null,
  meetings_allowed integer not null,
  profiles_min integer default 0,
  profiles_max integer default 0,
  priority_assistance boolean default false,
  description text,
  features jsonb default '[]'::jsonb,
  popular boolean default false,
  sort_order integer,
  active boolean default true
);

-- documents (photos, identity, kundli, etc.) — Cloudinary URLs stored here
create table if not exists documents (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  original_name text,
  stored_name text,
  path text,
  cloudinary_url text,
  cloudinary_public_id text,
  mimetype text,
  size integer,
  document_type text default 'identity',
  status text default 'Pending',
  rejection_reason text,
  uploaded_at bigint,
  reviewed_at bigint
);
create index if not exists idx_documents_user on documents (user_id);

-- appointments
create table if not exists appointments (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  date text not null,
  time text not null,
  type text default 'Consultation',
  notes text default '',
  status text default 'Booked',
  feedback text,
  completed_at bigint,
  created_at bigint
);
create index if not exists idx_appointments_date_time on appointments (date, time);

-- payments (manual UPI — Cloudinary receipt)
create table if not exists payments (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  plan text not null,
  amount integer default 0,
  upi_id text,
  utr text,
  receipt_path text,
  cloudinary_url text,
  receipt_name text,
  receipt_mimetype text,
  receipt_size integer,
  gateway text default 'manual_upi',
  status text default 'Pending Verification',
  rejection_reason text,
  created_at bigint,
  reviewed_at bigint
);
create index if not exists idx_payments_status on payments (status);
create index if not exists idx_payments_created on payments (created_at);

-- memberships
create table if not exists memberships (
  user_id text primary key references users(id) on delete cascade,
  tier text,
  price integer,
  active boolean default false,
  duration_days integer,
  meetings_allowed integer,
  used_meetings integer default 0,
  meetings_left integer,
  profiles_allowed integer,
  shared_profiles_count integer default 0,
  started_at bigint,
  expires_at bigint,
  activated_by_payment_id text,
  updated_at bigint
);

-- match_assignments
create table if not exists match_assignments (
  id text primary key,
  customer_id text not null references users(id) on delete cascade,
  candidate_id text not null references users(id) on delete cascade,
  note text,
  assigned_by text,
  assigned_at bigint
);
create index if not exists idx_match_assignments_customer on match_assignments (customer_id);

-- interest_requests
create table if not exists interest_requests (
  id text primary key,
  from_user_id text not null references users(id) on delete cascade,
  to_profile_id text not null references users(id) on delete cascade,
  status text default 'Pending',
  message text default '',
  created_at bigint,
  responded_at bigint
);
create index if not exists idx_interest_from on interest_requests (from_user_id);
create index if not exists idx_interest_to on interest_requests (to_profile_id);

-- shortlists
create table if not exists shortlists (
  user_id text not null references users(id) on delete cascade,
  profile_id text not null,
  created_at bigint,
  primary key (user_id, profile_id)
);

-- interests
create table if not exists interests (
  user_id text not null references users(id) on delete cascade,
  profile_id text not null,
  created_at bigint,
  primary key (user_id, profile_id)
);

-- notifications
create table if not exists notifications (
  id text primary key,
  to_user_id text not null references users(id) on delete cascade,
  from_user_id text,
  type text,
  payload text default '',
  read_at bigint,
  at bigint
);
create index if not exists idx_notifications_to on notifications (to_user_id, at desc);

-- internal_notes
create table if not exists internal_notes (
  id text primary key,
  target_type text,
  target_id text,
  author_id text references users(id) on delete set null,
  note text default '',
  created_at bigint
);
create index if not exists idx_internal_notes_target on internal_notes (target_type, target_id);

-- inquiries
create table if not exists inquiries (
  id text primary key,
  name text,
  mobile text,
  email text,
  subject text default 'General enquiry',
  message text default '',
  status text default 'New',
  admin_note text,
  created_at bigint,
  updated_at bigint
);
create index if not exists idx_inquiries_status on inquiries (status);

-- audit_logs
create table if not exists audit_logs (
  id text primary key,
  admin_id text,
  action text not null,
  target_user_id text,
  detail text default '',
  ip_address text default '',
  created_at bigint
);
create index if not exists idx_audit_action on audit_logs (action, created_at desc);
create index if not exists idx_audit_target on audit_logs (target_user_id, created_at desc);

-- auth_revocations
create table if not exists auth_revocations (
  user_id text primary key references users(id) on delete cascade,
  revoked_at bigint
);

-- otps (Supabase Auth also handles OTP, this mirrors legacy hashed OTP store)
create table if not exists otps (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  code_hash text not null,
  purpose text default 'login',
  attempts integer default 0,
  consumed_at bigint,
  created_at bigint,
  expires_at timestamptz
);
create index if not exists idx_otps_identifier on otps (identifier, created_at);
create index if not exists idx_otps_expires on otps (expires_at);

-- Enable Row Level Security (RLS) — Supabase Auth policies would be added here
-- For this migration we keep RLS disabled and enforce access via service_role
-- and the existing Express RBAC middleware. Enable per-table as needed.
-- alter table users enable row level security;
