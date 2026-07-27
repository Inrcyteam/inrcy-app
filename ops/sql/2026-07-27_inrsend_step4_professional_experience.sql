-- iNr'Send - Etape 4 : suivi professionnel, estimation et bilan persistant
-- A executer apres les SQL des etapes 1, 2 et 3, avant le deploiement du code etape 4.

alter table public.mail_campaigns
  add column if not exists progress_percent integer not null default 0,
  add column if not exists estimated_completion_at timestamptz,
  add column if not exists report_summary jsonb not null default '{}'::jsonb,
  add column if not exists report_updated_at timestamptz,
  add column if not exists completion_email_status text not null default 'pending',
  add column if not exists completion_email_attempts integer not null default 0,
  add column if not exists completion_email_last_error text,
  add column if not exists completion_email_sent_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'mail_campaigns_progress_percent_check'
      and conrelid = 'public.mail_campaigns'::regclass
  ) then
    alter table public.mail_campaigns
      add constraint mail_campaigns_progress_percent_check
      check (progress_percent between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'mail_campaigns_completion_email_status_check'
      and conrelid = 'public.mail_campaigns'::regclass
  ) then
    alter table public.mail_campaigns
      add constraint mail_campaigns_completion_email_status_check
      check (completion_email_status in ('pending', 'sending', 'sent', 'failed', 'skipped'));
  end if;
end $$;

create index if not exists mail_campaigns_live_tracking_idx
  on public.mail_campaigns (user_id, status, estimated_completion_at, updated_at desc);

create or replace function public.claim_mail_campaign_completion_email(
  p_campaign_id uuid,
  p_force boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean := false;
begin
  update public.mail_campaigns
  set completion_email_status = 'sending',
      completion_email_attempts = coalesce(completion_email_attempts, 0) + 1,
      completion_email_last_error = null,
      updated_at = clock_timestamp()
  where id = p_campaign_id
    and status in ('completed', 'partial', 'failed')
    and (
      p_force
      or completion_email_status in ('pending', 'failed')
    )
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.claim_mail_campaign_completion_email(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_mail_campaign_completion_email(uuid, boolean)
  to service_role;
