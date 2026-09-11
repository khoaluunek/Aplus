-- Apply through the Supabase SQL editor or `supabase db push` before deploying.
-- The service-role key is used only by Vercel Functions; these tables have no browser access.

create extension if not exists pgcrypto;

create table if not exists public.consultation_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  idempotency_key uuid unique,
  name text,
  phone text,
  email text,
  contact_method text,
  contact_time text,
  need text,
  message text,
  attachment_name text,
  attachment_size integer,
  attachment_bucket text,
  attachment_path text,
  attachment_retention_until timestamptz,
  attachment_deleted_at timestamptz,
  consent_at timestamptz,
  consent_version text,
  retention_until timestamptz,
  deleted_at timestamptz,
  status text not null default 'received',
  telegram_status text not null default 'pending',
  email_status text not null default 'not_configured',
  notification_attempts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.consultation_requests
  add column if not exists idempotency_key uuid unique,
  add column if not exists attachment_bucket text,
  add column if not exists attachment_path text,
  add column if not exists attachment_retention_until timestamptz,
  add column if not exists attachment_deleted_at timestamptz,
  add column if not exists consent_version text,
  add column if not exists retention_until timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists email_status text not null default 'not_configured',
  add column if not exists notification_attempts jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.consultation_requests
  alter column name drop not null,
  alter column need drop not null;

create unique index if not exists consultation_requests_request_id_key
  on public.consultation_requests (request_id);
create index if not exists consultation_requests_retention_idx
  on public.consultation_requests (retention_until)
  where deleted_at is null;
create index if not exists consultation_requests_attachment_retention_idx
  on public.consultation_requests (attachment_retention_until)
  where attachment_path is not null and attachment_deleted_at is null;

create table if not exists public.data_lifecycle_events (
  id bigint generated always as identity primary key,
  request_id text references public.consultation_requests(request_id) on delete set null,
  event_type text not null,
  actor text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists data_lifecycle_events_request_id_idx on public.data_lifecycle_events (request_id, created_at desc);

create table if not exists public.consultation_data_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  name text not null,
  email text not null,
  request_type text not null check (request_type in ('access', 'rectify', 'delete')),
  consultation_request_id text,
  status text not null default 'received',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.form_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  updated_at timestamptz not null default now()
);

-- Private by default: no Storage RLS policy is created for anonymous/authenticated users.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'consultation-files',
  'consultation-files',
  false,
  3145728,
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.consultation_requests enable row level security;
alter table public.data_lifecycle_events enable row level security;
alter table public.consultation_data_requests enable row level security;
alter table public.form_rate_limits enable row level security;

revoke all on table public.consultation_requests from anon, authenticated;
revoke all on table public.data_lifecycle_events from anon, authenticated;
revoke all on table public.consultation_data_requests from anon, authenticated;
revoke all on table public.form_rate_limits from anon, authenticated;
grant all on table public.consultation_requests, public.data_lifecycle_events, public.consultation_data_requests, public.form_rate_limits to service_role;
grant usage, select on all sequences in schema public to service_role;

-- The only public-schema function is deliberately callable by service_role alone.
-- It atomically counts a hashed, server-derived client key; no raw IP is stored.
create or replace function public.consume_consultation_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_count integer;
begin
  if length(p_key) <> 64 or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate-limit arguments';
  end if;

  insert into public.form_rate_limits as rate_limit (rate_key, window_started_at, attempt_count, updated_at)
  values (p_key, clock_timestamp(), 1, clock_timestamp())
  on conflict (rate_key) do update
  set window_started_at = case
        when rate_limit.window_started_at <= clock_timestamp() - make_interval(secs => p_window_seconds)
          then clock_timestamp()
        else rate_limit.window_started_at
      end,
      attempt_count = case
        when rate_limit.window_started_at <= clock_timestamp() - make_interval(secs => p_window_seconds)
          then 1
        else rate_limit.attempt_count + 1
      end,
      updated_at = clock_timestamp()
  returning attempt_count into current_count;

  return current_count <= p_limit;
end;
$$;

revoke all on function public.consume_consultation_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_consultation_rate_limit(text, integer, integer) to service_role;
