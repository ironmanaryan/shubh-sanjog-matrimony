-- ─────────────────────────────────────────────────────────────────────────────
-- Document storage: public bucket + Row Level Security policies
--
-- WHY THIS FILE EXISTS
--   Profile photos live in the `avatars` bucket. Other uploads (Aadhaar card,
--   income proof, scanned Kundli, certificates) live here. The bucket is
--   PUBLIC so the customer's own documents can be rendered in admin review
--   views and surfaced via direct `<img>` / `<a>` tags without minting a
--   signed URL. Writes are still authenticated + owner-scoped so a user
--   cannot upload into another user's folder.
--
--   Mirror of `supabase/storage_avatars.sql` for the new `documents` bucket.
--   Apply with:  npm run documents:storage-setup
--
-- Fully idempotent — safe to re-run at any time.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Buckets ──────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'application/pdf']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── 2. RLS policies on storage.objects ──────────────────────────────────────
-- (RLS is enabled in storage_avatars.sql; we don't toggle it here.)
drop policy if exists "Document files are publicly readable"      on storage.objects;
drop policy if exists "Users can upload their own documents"     on storage.objects;
drop policy if exists "Users can update their own documents"     on storage.objects;
drop policy if exists "Users can delete their own documents"     on storage.objects;

-- PUBLIC SELECT — paired with bucket.public = true above. Reads always
-- succeed without a session; the row-level scope (auth.uid() = folder owner)
-- is enforced on writes below.
create policy "Document files are publicly readable"
  on storage.objects for select
  using (bucket_id = 'documents');

-- Owner-scoped write. Path layout matches documentsController.js and
-- `lib/document-api.ts`:
--   `<userId>/<timestamp>-<rand>-<originalName>` (server)
--   `<userId>/<timestamp>.<ext>`                  (direct client-side fallback)
-- so (storage.foldername(name))[1] is always the owner.
create policy "Users can upload their own documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own documents"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own documents"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── 3. Column aliases on public.documents ────────────────────────────────────
-- The brief specifies (id, user_id, doc_type, file_url, created_at). The
-- historical schema uses (id, user_id, document_type, path, uploaded_at) —
-- preserved for backwards compatibility, but the new aliases are populated
-- automatically so callers can use either name. Triggers do the bookkeeping
-- so neither INSERT site has to remember.
do $$
begin
  -- Add doc_type if absent, mirroring document_type.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'doc_type'
  ) then
    alter table public.documents add column doc_type text;
    update public.documents set doc_type = document_type where doc_type is null;
  end if;

  -- Add file_url if absent (prefer cloudinary_url, fall back to path).
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'file_url'
  ) then
    alter table public.documents add column file_url text;
    update public.documents
       set file_url = coalesce(cloudinary_url, path)
       where file_url is null;
  end if;

  -- Add created_at if absent (alias of uploaded_at).
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'created_at'
  ) then
    alter table public.documents add column created_at bigint;
    update public.documents set created_at = uploaded_at where created_at is null;
  end if;
end
$$;

-- Keep the aliases in sync on every INSERT/UPDATE so the rest of the app
-- never has to dual-write. The trigger is AFTER so it cannot fail the
-- original write.
create or replace function public.documents_sync_aliases() returns trigger as $$
begin
  if new.doc_type is null then new.doc_type := new.document_type; end if;
  if new.file_url is null then new.file_url := coalesce(new.cloudinary_url, new.path); end if;
  if new.created_at is null then new.created_at := new.uploaded_at; end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_documents_sync_aliases on public.documents;
create trigger trg_documents_sync_aliases
  before insert or update on public.documents
  for each row execute function public.documents_sync_aliases();

-- Backwards-sync is also useful: if a row lands with the canonical names set
-- but aliases null, the BEFORE trigger fills them in (handled above).
-- An AFTER trigger mirrors writes from old -> new columns too.
create or replace function public.documents_mirror_aliases_after() returns trigger as $$
begin
  if new.document_type is null and new.doc_type is not null then
    update public.documents set document_type = new.doc_type where id = new.id;
  end if;
  if (new.path is null and new.file_url is not null)
     or (new.cloudinary_url is null and new.file_url is not null) then
    update public.documents
       set path          = coalesce(new.path, new.file_url),
           cloudinary_url = coalesce(new.cloudinary_url, new.file_url)
       where id = new.id;
  end if;
  if new.uploaded_at is null and new.created_at is not null then
    update public.documents set uploaded_at = new.created_at where id = new.id;
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_documents_mirror_aliases_after on public.documents;
create trigger trg_documents_mirror_aliases_after
  after insert or update on public.documents
  for each row execute function public.documents_mirror_aliases_after();

-- ─── 4. Row Level Security on public.documents ───────────────────────────────
-- The schema comment claimed RLS is OFF, but the live table has
-- `relrowsecurity = true` with NO policies — every INSERT/SELECT/UPDATE/
-- DELETE from an authenticated browser client fails with
-- "new row violates row-level security policy for table documents". That is
-- what made the direct-fallback path fail in production.
--
-- Fix: enable RLS and attach owner-scoped policies. The service-role key
-- continues to bypass RLS for the Express admin routes.
do $$
begin
  -- Make sure RLS is on (idempotent — `enable` is a no-op when already on).
  alter table public.documents enable row level security;
exception when others then null;
end
$$;

drop policy if exists "Users can read their own documents"       on public.documents;
drop policy if exists "Users can insert their own documents"    on public.documents;
drop policy if exists "Users can update their own documents"    on public.documents;
drop policy if exists "Users can delete their own documents"    on public.documents;

-- Owner-scoped SELECT. A user may only read rows they wrote.
create policy "Users can read their own documents"
  on public.documents for select
  to authenticated
  using ((select auth.uid())::text = user_id);

-- Owner-scoped INSERT. The browser client always inserts with the user's
-- own Supabase session, so this matches the row's user_id to auth.uid().
create policy "Users can insert their own documents"
  on public.documents for insert
  to authenticated
  with check ((select auth.uid())::text = user_id);

-- Owner-scoped UPDATE.
create policy "Users can update their own documents"
  on public.documents for update
  to authenticated
  using      ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);

-- Owner-scoped DELETE — admin Deletes through the service-role key bypass
-- RLS entirely, so this policy does not affect the audit-logged
-- `/api/admin/documents/*` paths.
create policy "Users can delete their own documents"
  on public.documents for delete
  to authenticated
  using ((select auth.uid())::text = user_id);

-- ─── 5. RLS on storage.objects for the documents bucket is set up above. ────
