-- Admin Authentication System for Shubh Sanjog Matrimony
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/banrojskoitemzwosvfm/sql/new

create extension if not exists "pgcrypto";

-- admin_users: stores master admin credentials (username + email + bcrypt hash)
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  email text unique not null,
  password_hash text not null,
  created_at timestamptz default now()
);
create index if not exists idx_admin_users_email on admin_users(email);
create index if not exists idx_admin_users_username on admin_users(username);

-- admin_otps: stores 6-digit email OTPs for forgot-password flow
create table if not exists admin_otps (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  otp_code text not null,
  expires_at timestamptz not null,
  is_used boolean default false,
  created_at timestamptz default now()
);
create index if not exists idx_admin_otps_email on admin_otps(email);
create index if not exists idx_admin_otps_expires on admin_otps(expires_at);
create index if not exists idx_admin_otps_is_used on admin_otps(is_used);

-- RLS disabled for service_role access (Next.js API uses service_role)
-- alter table admin_users enable row level security;
-- alter table admin_otps enable row level security;
