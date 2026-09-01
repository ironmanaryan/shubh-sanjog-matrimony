-- ─────────────────────────────────────────────────────────────────────────────
-- Profile photo storage: bucket + Row Level Security policies
--
-- WHY THIS FILE EXISTS
--   The `avatars` bucket already existed and was marked public, so uploads
--   *looked* configured. But `storage.objects` had RLS enabled with ZERO
--   policies — in Postgres, RLS with no policy denies every row. Every browser
--   upload with the anon key therefore died with:
--     {"statusCode":"403","error":"Unauthorized",
--      "message":"new row violates row-level security policy"}
--   That is the "profile photo never uploads / stuck on the initial letter"
--   bug. A public bucket is NOT enough — reads need an explicit SELECT policy
--   too, otherwise getPublicUrl() returns a URL that 403s.
--
--   Apply with:  npm run avatar:storage-setup
--   (runs scripts/avatar-storage-setup.js over the Postgres connection)
--
-- Fully idempotent — safe to re-run at any time.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Buckets ──────────────────────────────────────────────────────────────
-- `avatars` is the canonical bucket for profile photos. 5 MB ceiling is
-- generous: the client compresses to ~4-10 KB before it ever gets here, this
-- is only a backstop against a broken/legacy client.
--
-- The legacy `profiles` bucket is deliberately left untouched: it already
-- exists and is public, and older code paths (create-profile, fill-details)
-- still write photos there. Narrowing its mime allowlist could break them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── 2. RLS policies on storage.objects ──────────────────────────────────────
-- RLS is already enabled on storage.objects — that is precisely the bug: it
-- was enabled with no policies attached, so every row was denied.
--
-- We therefore do NOT run a bare `alter table storage.objects enable row level
-- security`. Two reasons: (a) it is already on, and (b) ALTER TABLE requires
-- table ownership, and `storage.objects` is owned by `supabase_storage_admin`,
-- which the `postgres` role may not assume — the statement would fail with
-- "must be owner of table objects". The guard below turns it on only if a
-- future migration ever disables it, and stays silent in the normal case.
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects' and c.relrowsecurity
  ) then
    alter table storage.objects enable row level security;
    raise notice 'storage.objects RLS enabled';
  else
    raise notice 'storage.objects RLS already enabled — skipping alter';
  end if;
end
$$;

-- Drop-then-create keeps re-runs converging on exactly these definitions.
drop policy if exists "Avatar images are publicly readable" on storage.objects;
drop policy if exists "Users can upload their own avatar"  on storage.objects;
drop policy if exists "Users can update their own avatar"   on storage.objects;
drop policy if exists "Users can delete their own avatar"   on storage.objects;

-- Public read. Avatars are shown on the dashboard and to matched members, so
-- read access must not require a session.
create policy "Avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id in ('avatars', 'profiles'));

-- Authenticated write, scoped to the caller's own folder.
--
-- Objects are written to `<auth.uid()>/<timestamp>.webp`, so
-- `storage.foldername(name)[1]` is the owning user id. Comparing it to
-- auth.uid()::text means a user can only write inside their own folder —
-- they cannot overwrite or delete someone else's avatar.
create policy "Users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('avatars', 'profiles')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('avatars', 'profiles')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('avatars', 'profiles')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('avatars', 'profiles')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── 3. public.profiles: RLS intentionally left DISABLED ─────────────────────
--
-- RLS on public.profiles is currently OFF and that is deliberate. The
-- dashboard writes avatar_url straight from the browser with the user's own
-- JWT, which works today. Enabling RLS would break
-- app/auth/callback/route.ts: that route falls back to a session-less anon
-- client to bootstrap a brand-new user's `profiles` row, and with RLS on, an
-- anonymous INSERT has no auth.uid() to match and would be rejected — locking
-- new signups out of /customer entirely.
--
-- If you later enable RLS on profiles, add owner-scoped policies AND make the
-- service-role key mandatory in every environment (including Vercel) so the
-- bootstrap path bypasses RLS:
--
--   alter table public.profiles enable row level security;
--   create policy "Users can view their own profile"
--     on public.profiles for select to authenticated
--     using (auth.uid()::text = id);
--   create policy "Users can insert their own profile"
--     on public.profiles for insert to authenticated
--     with check (auth.uid()::text = id);
--   create policy "Users can update their own profile"
--     on public.profiles for update to authenticated
--     using (auth.uid()::text = id) with check (auth.uid()::text = id);
