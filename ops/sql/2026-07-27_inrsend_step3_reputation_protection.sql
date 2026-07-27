-- iNr'Send - Etape 3 : protection de la reputation des boites mail
-- A executer apres les SQL des etapes 1 et 2, avant le deploiement du code etape 3.

create extension if not exists pgcrypto;

create table if not exists public.mailbox_reputation_state (
  integration_id uuid primary key references public.integrations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  account_email text,
  health_status text not null default 'warming'
    check (health_status in ('warming', 'healthy', 'watch', 'paused')),
  accepted_count bigint not null default 0,
  temporary_failure_count bigint not null default 0,
  hard_bounce_count bigint not null default 0,
  complaint_count bigint not null default 0,
  consecutive_failures integer not null default 0,
  last_outcome text,
  last_error_kind text,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  paused_until timestamptz,
  dns_status text,
  spf_status text,
  dkim_status text,
  dmarc_status text,
  dns_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mailbox_reputation_state_user_idx
  on public.mailbox_reputation_state (user_id, updated_at desc);

create index if not exists mailbox_reputation_state_health_idx
  on public.mailbox_reputation_state (health_status, paused_until, updated_at desc);

alter table public.mailbox_reputation_state enable row level security;

drop policy if exists mailbox_reputation_state_select_own on public.mailbox_reputation_state;
create policy mailbox_reputation_state_select_own
  on public.mailbox_reputation_state
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Les mises a jour sont reservees au service_role via les routes serveur.
-- Aucun insert/update/delete direct n'est accorde au client authentifie.

create or replace function public.record_mailbox_reputation_outcome(
  p_integration_id uuid,
  p_user_id uuid,
  p_provider text,
  p_account_email text,
  p_outcome text,
  p_error_kind text default null
)
returns public.mailbox_reputation_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.mailbox_reputation_state;
begin
  if p_integration_id is null or p_user_id is null then
    raise exception 'integration_id et user_id obligatoires';
  end if;

  if p_outcome not in ('accepted', 'temporary_failure', 'hard_bounce', 'complaint', 'account_blocked') then
    raise exception 'outcome invalide';
  end if;

  insert into public.mailbox_reputation_state (
    integration_id,
    user_id,
    provider,
    account_email,
    health_status,
    accepted_count,
    temporary_failure_count,
    hard_bounce_count,
    complaint_count,
    consecutive_failures,
    last_outcome,
    last_error_kind,
    last_success_at,
    last_failure_at,
    paused_until,
    updated_at
  )
  values (
    p_integration_id,
    p_user_id,
    coalesce(nullif(p_provider, ''), 'imap'),
    p_account_email,
    case
      when p_outcome in ('complaint', 'account_blocked') then 'paused'
      when p_outcome = 'temporary_failure' then 'watch'
      when p_outcome = 'hard_bounce' then 'warming'
      else 'warming'
    end,
    case when p_outcome = 'accepted' then 1 else 0 end,
    case when p_outcome = 'temporary_failure' then 1 else 0 end,
    case when p_outcome = 'hard_bounce' then 1 else 0 end,
    case when p_outcome = 'complaint' then 1 else 0 end,
    case when p_outcome = 'accepted' then 0 else 1 end,
    p_outcome,
    p_error_kind,
    case when p_outcome = 'accepted' then v_now else null end,
    case when p_outcome <> 'accepted' then v_now else null end,
    case
      when p_outcome = 'complaint' then v_now + interval '24 hours'
      when p_outcome = 'account_blocked' then v_now + interval '6 hours'
      else null
    end,
    v_now
  )
  on conflict (integration_id) do update
  set user_id = excluded.user_id,
      provider = excluded.provider,
      account_email = coalesce(excluded.account_email, public.mailbox_reputation_state.account_email),
      accepted_count = public.mailbox_reputation_state.accepted_count + case when p_outcome = 'accepted' then 1 else 0 end,
      temporary_failure_count = public.mailbox_reputation_state.temporary_failure_count + case when p_outcome = 'temporary_failure' then 1 else 0 end,
      hard_bounce_count = public.mailbox_reputation_state.hard_bounce_count + case when p_outcome = 'hard_bounce' then 1 else 0 end,
      complaint_count = public.mailbox_reputation_state.complaint_count + case when p_outcome = 'complaint' then 1 else 0 end,
      consecutive_failures = case
        when p_outcome = 'accepted' then 0
        else public.mailbox_reputation_state.consecutive_failures + 1
      end,
      last_outcome = p_outcome,
      last_error_kind = p_error_kind,
      last_success_at = case when p_outcome = 'accepted' then v_now else public.mailbox_reputation_state.last_success_at end,
      last_failure_at = case when p_outcome <> 'accepted' then v_now else public.mailbox_reputation_state.last_failure_at end,
      paused_until = case
        when p_outcome = 'complaint' then v_now + interval '24 hours'
        when p_outcome = 'account_blocked' then v_now + interval '6 hours'
        when p_outcome = 'accepted' and public.mailbox_reputation_state.paused_until <= v_now then null
        else public.mailbox_reputation_state.paused_until
      end,
      health_status = case
        when p_outcome in ('complaint', 'account_blocked') then 'paused'
        when p_outcome = 'hard_bounce' and public.mailbox_reputation_state.hard_bounce_count + 1 >= 3 then 'watch'
        when p_outcome = 'hard_bounce' then public.mailbox_reputation_state.health_status
        when p_outcome = 'temporary_failure' and public.mailbox_reputation_state.consecutive_failures + 1 >= 2 then 'watch'
        when p_outcome = 'accepted'
          and public.mailbox_reputation_state.accepted_count + 1 >= 50
          and public.mailbox_reputation_state.complaint_count = 0
          and public.mailbox_reputation_state.consecutive_failures = 0
          then 'healthy'
        when p_outcome = 'accepted' then 'warming'
        else public.mailbox_reputation_state.health_status
      end,
      updated_at = v_now
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.record_mailbox_reputation_outcome(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_mailbox_reputation_outcome(uuid, uuid, text, text, text, text)
  to service_role;

-- Les anciennes installations peuvent ne pas encore avoir les briques de
-- suppression et de suivi de delivrabilite. L'etape 3 les rend idempotentes.
create table if not exists public.mail_suppression_list (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  email_normalized text not null,
  reason text not null check (reason in ('opt_out', 'blacklist', 'hard_bounce', 'complaint')),
  source text,
  campaign_id uuid,
  recipient_id uuid,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mail_suppression_list_user_email_uniq
  on public.mail_suppression_list (user_id, email_normalized);

alter table public.mail_suppression_list enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mail_suppression_list'
      and policyname = 'mail_suppression_list_select_own'
  ) then
    create policy mail_suppression_list_select_own
      on public.mail_suppression_list for select to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

alter table public.mail_campaign_recipients
  add column if not exists suppression_reason text,
  add column if not exists bounce_type text,
  add column if not exists bounced_at timestamptz,
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists delivery_status text,
  add column if not exists delivery_event text,
  add column if not exists delivery_last_event_at timestamptz,
  add column if not exists delivered_at timestamptz;

create index if not exists mail_campaign_recipients_user_email_status_idx
  on public.mail_campaign_recipients (user_id, lower(email), status);

create table if not exists public.mail_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  event_type text not null,
  provider_message_id text,
  email text,
  payload jsonb not null default '{}'::jsonb,
  matched_campaign_id uuid references public.mail_campaigns(id) on delete set null,
  matched_recipient_id uuid references public.mail_campaign_recipients(id) on delete set null,
  processed_at timestamptz,
  result text,
  created_at timestamptz not null default now()
);

create unique index if not exists mail_provider_events_provider_external_uniq
  on public.mail_provider_events (provider, external_event_id);

alter table public.mail_provider_events enable row level security;

-- Les evenements de delivrabilite contiennent des donnees techniques et parfois
-- le contenu d'un retour automatique. Ils restent exclusivement accessibles
-- au service_role ; aucune policy client n'est creee.
