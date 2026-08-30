-- Fix missing columns in profiles table for fill-details
-- Run this in Supabase SQL Editor if you already ran the previous migration
-- https://supabase.com/dashboard/project/culcgbqeengmhdlbfwuq/sql/new

alter table if exists profiles add column if not exists state text;
alter table if exists profiles add column if not exists "subCaste" text;
-- Ensure city and location are text (they already exist, but ensure)
alter table if exists profiles add column if not exists city text;
alter table if exists profiles add column if not exists location text;
