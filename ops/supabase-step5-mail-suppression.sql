-- Étape 5 iNrCy / iNr'Send
-- Opt-out / blacklist / bounce management

create extension if not exists pgcrypto;

create table if not exists public.mail_suppression_list (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  email_normalized text not null,
  reason text not null check (reason in ('opt_out', 'blacklist', 'hard_bounce', 'complaint')),
  source text null,
  campaign_id uuid null,
  recipient_id uuid null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mail_suppression_list_user_email_uniq
  on public.mail_suppression_list (user_id, email_normalized);

create index if not exists mail_suppression_list_user_reason_idx
  on public.mail_suppression_list (user_id, reason, created_at desc);

alter table public.mail_suppression_list enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mail_suppression_list' and policyname = 'mail_suppression_list_select_own'
  ) then
    create policy mail_suppression_list_select_own
      on public.mail_suppression_list
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mail_suppression_list' and policyname = 'mail_suppression_list_insert_own'
  ) then
    create policy mail_suppression_list_insert_own
      on public.mail_suppression_list
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mail_suppression_list' and policyname = 'mail_suppression_list_update_own'
  ) then
    create policy mail_suppression_list_update_own
      on public.mail_suppression_list
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mail_suppression_list' and policyname = 'mail_suppression_list_delete_own'
  ) then
    create policy mail_suppression_list_delete_own
      on public.mail_suppression_list
      for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

alter table public.mail_campaign_recipients
  add column if not exists suppression_reason text null check (suppression_reason in ('opt_out', 'blacklist', 'hard_bounce', 'complaint')),
  add column if not exists bounce_type text null check (bounce_type in ('hard', 'soft')),
  add column if not exists bounced_at timestamptz null,
  add column if not exists unsubscribed_at timestamptz null;

create index if not exists mail_campaign_recipients_campaign_created_idx
  on public.mail_campaign_recipients (campaign_id, created_at asc);

create index if not exists mail_campaign_recipients_user_email_status_idx
  on public.mail_campaign_recipients (user_id, lower(email), status);

create index if not exists mail_campaign_recipients_suppression_reason_idx
  on public.mail_campaign_recipients (suppression_reason, bounce_type);

update public.mail_suppression_list
set email_normalized = lower(trim(email))
where email_normalized is distinct from lower(trim(email));
