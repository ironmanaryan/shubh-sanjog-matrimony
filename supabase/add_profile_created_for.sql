-- Migration: Add profile_created_for column for "This Profile is for" onboarding step
-- Auto-handling: This file is generated to ensure the column exists before profile creation.
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- Safe to run multiple times due to IF NOT EXISTS.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_created_for TEXT DEFAULT 'myself';

-- Optional: Add check constraint for allowed values
-- ALTER TABLE public.profiles ADD CONSTRAINT profiles_profile_created_for_check
--   CHECK (profile_created_for IN ('myself','son','daughter','brother','sister','friend','relative'));

-- Verify: SELECT column_name, data_type, column_default FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='profiles' AND column_name='profile_created_for';
