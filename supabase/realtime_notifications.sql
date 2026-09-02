-- ============================================================================
-- REALTIME NOTIFICATIONS — Shubh Sanjog Matrimony
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
--
-- What it does:
--   1. Adds `notifications` to the `supabase_realtime` publication so the
--      browser can subscribe to INSERT events (live notification panel).
--   2. Enables RLS on `notifications` so each customer only receives THEIR
--      rows over realtime (users.id != auth.uid() — the app keeps its own
--      user table, so the policy joins through it).
--   3. Creates pg_cron jobs:
--        • appointment-reminders      — daily, for appointments happening
--          tomorrow (status = 'Booked')  → type: appointment_reminder
--        • membership-expiry-reminders— daily, for active memberships
--          expiring within 3 days        → type: membership_expiry_reminder
--      Both are idempotent (never send the same reminder twice).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Realtime publication (idempotent)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Row Level Security — customers see / update only their own notifications.
--    The server keeps using the service-role key (bypasses RLS), so none of
--    the existing Express API behaviour changes.
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications
  for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = notifications.to_user_id
        and (
          u.identifier = auth.uid()::text
          or (u.email is not null and lower(u.email) = lower(coalesce(auth.email(), ''))
              and coalesce(auth.email(), '') <> '')
        )
    )
  );

-- lets the browser write its own booking confirmation / self-directed events
drop policy if exists "notifications_insert_own" on public.notifications;
create policy "notifications_insert_own"
  on public.notifications
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.users u
      where u.id = notifications.to_user_id
        and (
          u.identifier = auth.uid()::text
          or (u.email is not null and lower(u.email) = lower(coalesce(auth.email(), ''))
              and coalesce(auth.email(), '') <> '')
        )
    )
  );

-- lets the browser mark its own notifications as read
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications
  for update
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = notifications.to_user_id
        and (
          u.identifier = auth.uid()::text
          or (u.email is not null and lower(u.email) = lower(coalesce(auth.email(), ''))
              and coalesce(auth.email(), '') <> '')
        )
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.id = notifications.to_user_id
        and (
          u.identifier = auth.uid()::text
          or (u.email is not null and lower(u.email) = lower(coalesce(auth.email(), ''))
              and coalesce(auth.email(), '') <> '')
        )
    )
  );

create index if not exists idx_notifications_type_to
  on public.notifications (to_user_id, type);

-- ---------------------------------------------------------------------------
-- 3. pg_cron reminder jobs
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

-- epoch milliseconds "now" helper (notifications.at is bigint epoch-ms)
create or replace function public.notification_now_ms()
returns bigint
language sql
stable
as $$
  select (extract(epoch from now()) * 1000)::bigint;
$$;

-- --- Appointment reminder: appointment is tomorrow and still 'Booked' -------
create or replace function public.fn_send_appointment_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
  target_date text;
begin
  -- appointments.date is stored as text 'YYYY-MM-DD'
  select to_char((now() + interval '1 day')::date, 'YYYY-MM-DD') into target_date;

  with new_reminders as (
    select a.id, a.user_id, a.date, a.time, a.type
    from public.appointments a
    where a.date = target_date
      and a.status = 'Booked'
      and a.user_id is not null
      -- guard: skip orphaned appointments whose user row no longer exists,
      -- otherwise the FK on notifications.to_user_id aborts the whole run
      and exists (select 1 from public.users u where u.id = a.user_id)
      and not exists (
        select 1 from public.notifications n
        where n.to_user_id = a.user_id
          and n.type = 'appointment_reminder'
          and n.payload like '%' || a.id || '%'
      )
  )
  insert into public.notifications (id, to_user_id, from_user_id, type, payload, at)
  select
    gen_random_uuid()::text,
    r.user_id,
    r.user_id,
    'appointment_reminder',
    jsonb_build_object(
      'appointmentId', r.id,
      'date', r.date,
      'time', r.time,
      'meetingType', r.type
    )::text,
    public.notification_now_ms()
  from new_reminders r;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- --- Membership expiry reminder: active membership expires within 3 days ----
create or replace function public.fn_send_membership_expiry_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
  now_ms bigint;
  limit_ms bigint;
begin
  select public.notification_now_ms() into now_ms;
  select (extract(epoch from (now() + interval '3 days')) * 1000)::bigint into limit_ms;

  with expiring as (
    select m.user_id, m.tier, m.expires_at
    from public.memberships m
    where m.active = true
      and m.expires_at is not null
      and m.expires_at > now_ms
      and m.expires_at <= limit_ms
      -- guard: skip orphaned memberships whose user row no longer exists
      and exists (select 1 from public.users u where u.id = m.user_id)
      and not exists (
        select 1 from public.notifications n
        where n.to_user_id = m.user_id
          and n.type = 'membership_expiry_reminder'
          and n.payload like '%' || m.expires_at::text || '%'
          and n.payload like '%' || coalesce(m.tier, '') || '%'
      )
  )
  insert into public.notifications (id, to_user_id, from_user_id, type, payload, at)
  select
    gen_random_uuid()::text,
    e.user_id,
    e.user_id,
    'membership_expiry_reminder',
    jsonb_build_object(
      'tier', e.tier,
      'expiresAt', e.expires_at
    )::text,
    public.notification_now_ms()
  from expiring e;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- Daily at 03:30 UTC (09:00 IST) — friendly morning notification time.
select cron.unschedule('appointment-reminders')
where exists (select 1 from cron.job where jobname = 'appointment-reminders');
select cron.schedule('appointment-reminders', '30 3 * * *', $$select public.fn_send_appointment_reminders()$$);

select cron.unschedule('membership-expiry-reminders')
where exists (select 1 from cron.job where jobname = 'membership-expiry-reminders');
select cron.schedule('membership-expiry-reminders', '35 3 * * *', $$select public.fn_send_membership_expiry_reminders()$$);
