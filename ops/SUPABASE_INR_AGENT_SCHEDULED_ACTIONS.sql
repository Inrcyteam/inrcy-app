-- iNr'Agent - actions programmées par le pro
-- À exécuter dans Supabase SQL Editor avant de brancher Programmer dans Publier / Propulser / Fidéliser.

create extension if not exists pgcrypto;

create table if not exists public.inr_agent_scheduled_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  automation_key text,
  action_type text not null default 'custom',
  target_tool text not null default 'agent',
  source text not null default 'manual',
  title text not null,
  summary text,
  scheduled_at timestamptz not null,
  timezone text not null default 'Europe/Paris',
  channels text[] not null default array[]::text[],
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'scheduled',
  attempt_count integer not null default 0,
  last_error text,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inr_agent_scheduled_actions add column if not exists automation_key text;
alter table public.inr_agent_scheduled_actions add column if not exists action_type text not null default 'custom';
alter table public.inr_agent_scheduled_actions add column if not exists target_tool text not null default 'agent';
alter table public.inr_agent_scheduled_actions add column if not exists source text not null default 'manual';
alter table public.inr_agent_scheduled_actions add column if not exists title text not null default 'Action programmée';
alter table public.inr_agent_scheduled_actions add column if not exists summary text;
alter table public.inr_agent_scheduled_actions add column if not exists scheduled_at timestamptz not null default now();
alter table public.inr_agent_scheduled_actions add column if not exists timezone text not null default 'Europe/Paris';
alter table public.inr_agent_scheduled_actions add column if not exists channels text[] not null default array[]::text[];
alter table public.inr_agent_scheduled_actions add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.inr_agent_scheduled_actions add column if not exists status text not null default 'scheduled';
alter table public.inr_agent_scheduled_actions add column if not exists attempt_count integer not null default 0;
alter table public.inr_agent_scheduled_actions add column if not exists last_error text;
alter table public.inr_agent_scheduled_actions add column if not exists executed_at timestamptz;
alter table public.inr_agent_scheduled_actions add column if not exists created_at timestamptz not null default now();
alter table public.inr_agent_scheduled_actions add column if not exists updated_at timestamptz not null default now();

alter table public.inr_agent_scheduled_actions drop constraint if exists inr_agent_scheduled_actions_automation_key_check;
alter table public.inr_agent_scheduled_actions drop constraint if exists inr_agent_scheduled_actions_action_type_check;
alter table public.inr_agent_scheduled_actions drop constraint if exists inr_agent_scheduled_actions_target_tool_check;
alter table public.inr_agent_scheduled_actions drop constraint if exists inr_agent_scheduled_actions_source_check;
alter table public.inr_agent_scheduled_actions drop constraint if exists inr_agent_scheduled_actions_status_check;

alter table public.inr_agent_scheduled_actions
  add constraint inr_agent_scheduled_actions_automation_key_check
  check (automation_key is null or automation_key in ('publish', 'grow', 'loyalty', 'stats'));

alter table public.inr_agent_scheduled_actions
  add constraint inr_agent_scheduled_actions_action_type_check
  check (action_type in ('publication', 'campaign', 'stats_report', 'mailing', 'review_request', 'loyalty', 'custom'));

alter table public.inr_agent_scheduled_actions
  add constraint inr_agent_scheduled_actions_target_tool_check
  check (target_tool in ('booster', 'mails', 'propulser', 'fideliser', 'inrstats', 'agent'));

alter table public.inr_agent_scheduled_actions
  add constraint inr_agent_scheduled_actions_source_check
  check (source in ('manual', 'automatic'));

alter table public.inr_agent_scheduled_actions
  add constraint inr_agent_scheduled_actions_status_check
  check (status in ('scheduled', 'running', 'done', 'failed', 'cancelled'));

create index if not exists idx_inr_agent_scheduled_actions_user_status
on public.inr_agent_scheduled_actions (user_id, status, scheduled_at asc);

create index if not exists idx_inr_agent_scheduled_actions_due
on public.inr_agent_scheduled_actions (scheduled_at asc, status)
where status = 'scheduled';

create index if not exists idx_inr_agent_scheduled_actions_user_tool
on public.inr_agent_scheduled_actions (user_id, target_tool, scheduled_at asc);

alter table public.inr_agent_scheduled_actions enable row level security;

drop policy if exists "Users can read own inr agent scheduled actions" on public.inr_agent_scheduled_actions;
create policy "Users can read own inr agent scheduled actions"
on public.inr_agent_scheduled_actions
for select
using (auth.uid() = user_id);

-- Les insert/update/delete passent par l'API serveur avec supabaseAdmin.
