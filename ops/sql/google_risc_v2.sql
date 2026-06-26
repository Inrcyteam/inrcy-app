-- Google RISC / Protection multicompte V2
-- Table passive de journalisation des Security Event Tokens Google.
-- SQL additif : ne modifie pas les tables existantes.

create extension if not exists pgcrypto;

create table if not exists public.security_events_google (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'google',
  request_id text,
  jti text,
  iat bigint,
  iss text,
  aud jsonb,
  event_types text[] not null default '{}',
  provider_account_ids text[] not null default '{}',
  integration_ids text[] not null default '{}',
  matched_by text not null default 'none',
  action text not null default 'logged_only',
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists security_events_google_provider_jti_unique
  on public.security_events_google (provider, jti)
  where jti is not null and btrim(jti) <> '';

create index if not exists security_events_google_received_at_idx
  on public.security_events_google (received_at desc);

create index if not exists security_events_google_action_idx
  on public.security_events_google (action);

create index if not exists security_events_google_integration_ids_gin_idx
  on public.security_events_google using gin (integration_ids);

alter table public.security_events_google enable row level security;

drop policy if exists "security_events_google_service_role_all" on public.security_events_google;
create policy "security_events_google_service_role_all"
  on public.security_events_google
  for all
  to service_role
  using (true)
  with check (true);
