-- Shubh Sanjog Matrimony - Profiles table for post-OAuth registration
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/culcgbqeengmhdlbfwuq/sql
-- This table is required for is_completed unlock flow (auth/callback + middleware + fill-details)

create extension if not exists "pgcrypto";

create table if not exists profiles (
  id text primary key, -- Supabase auth user.id
  user_id text unique, -- duplicate for query flexibility (id == user_id)
  full_name text,
  gender text,
  dob text, -- ISO date string
  date_of_birth text,
  age integer,
  height text,
  weight text,
  religion text,
  caste text,
  sub_caste text,
  mother_tongue text,
  marital_status text,
  location text,
  city text,
  country text default 'India',
  citizenship text default 'Indian',
  nri_status boolean default false,
  manglik_status text,
  horoscope_details text,
  phone text,
  phone_number text,
  email text,
  highest_qualification text,
  qualification text,
  education_details text,
  profession text,
  job_business text,
  company text,
  organization text,
  annual_income text,
  work_location text,
  experience text,
  years_of_experience text,
  food_preference text,
  smoking text,
  drinking text,
  hobbies text,
  interests text,
  about text,
  about_me text,
  bio text,
  personality text,
  father_name text,
  father_occupation text,
  mother_name text,
  mother_occupation text,
  brothers integer,
  sisters integer,
  number_of_brothers integer,
  number_of_sisters integer,
  family_type text,
  family_status text,
  family_location text,
  photo_url text,
  avatar_url text,
  profile_photo text,
  -- JSON fallbacks for structured data
  personal jsonb default '{}'::jsonb,
  education jsonb default '{}'::jsonb,
  family jsonb default '{}'::jsonb,
  lifestyle jsonb default '{}'::jsonb,
  preferences jsonb default '{}'::jsonb,
  is_completed boolean default false,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_profiles_user_id on profiles(user_id);
create index if not exists idx_profiles_is_completed on profiles(is_completed);
create index if not exists idx_profiles_email on profiles(email);

-- RLS: keep disabled for now (enforce via service_role + middleware), matching existing schema
-- alter table profiles enable row level security;
-- create policy "Allow authenticated to manage own profile" on profiles for all using (auth.uid()::text = id) with check (auth.uid()::text = id);

-- Storage buckets for profile photos (if not exists, create via dashboard Storage)
-- insert into storage.buckets (id, name, public) values ('profiles', 'profiles', true) on conflict do nothing;
-- insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict do nothing;
