-- ─────────────────────────────────────────────────────────────────────────────
-- Document storage: bucket + RLS policies
--
-- WHY THIS FILE EXISTS
--   Profile photos live in the `avatars` bucket. Other uploads (Aadhaar card,
--   income proof, scanned Kundli, certificates) live here. The bucket is
--   private (RLS-on, public-read off) because documents contain PII — they
--   should never be reachable by URL alone. Reads go through the server-side
--   signed-URL endpoint (`GET /api/documents/:id/sign`), not the public path.
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
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'application/pdf']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── 2. RLS policies on storage.objects ──────────────────────────────────────
-- (RLS is enabled in storage_avatars.sql; we don't toggle it here.)
drop policy if exists "Document files are readable by owner and staff" on storage.objects;
drop policy if exists "Users can upload their own documents"         on storage.objects;
drop policy if exists "Users can update their own documents"         on storage.objects;
drop policy if exists "Users can delete their own documents"         on storage.objects;

-- Owner / staff read. Public SELECT is intentionally NOT granted — all reads
-- must go through the server signing endpoint, which enforces self-vs-staff
-- isolation and emits an audit log entry.
create policy "Document files are readable by owner and staff"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      -- staff roles cannot be inferred here cleanly (Postgres auth claims have
      -- no "role" column). The server-side /documents/:id endpoint is the
      -- authoritative check; this policy just unblocks the owner for direct
      -- next/image usage from the dashboard.
    )
  );

-- Owner-scoped write. Path layout matches documentsController.js:
--   `<userId>/<timestamp>-<rand>-<originalName>`
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
