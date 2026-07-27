-- iNr'Send - Etape 2 : campagnes intelligentes
-- A executer apres l'etape 1 et avant le deploiement du code etape 2.

alter table public.mail_campaigns
  add column if not exists pause_reason text,
  add column if not exists resume_at timestamptz;

alter table public.mail_campaign_recipients
  add column if not exists dispatch_key text,
  add column if not exists failure_kind text,
  add column if not exists failure_retryable boolean,
  add column if not exists provider_status integer;

-- Les anciennes migrations ne connaissaient pas encore les statuts paused et
-- completed. NOT VALID evite de bloquer le deploiement si un historique ancien
-- contient une valeur legacy, tout en protegeant immediatement les nouveaux
-- inserts et updates.
alter table public.mail_campaigns
  drop constraint if exists mail_campaigns_status_check;
alter table public.mail_campaigns
  add constraint mail_campaigns_status_check
  check (status in ('queued', 'processing', 'paused', 'sent', 'completed', 'partial', 'failed'))
  not valid;

-- Une cle unique est attribuee a la premiere occurrence historique de chaque
-- adresse. Les anciens doublons eventuels restent consultables mais ne
-- bloquent pas la migration. Toutes les nouvelles campagnes renseignent cette
-- cle et sont ensuite protegees par l'index unique.
with ranked as (
  select
    id,
    campaign_id,
    lower(btrim(email)) as normalized_email,
    row_number() over (
      partition by campaign_id, lower(btrim(email))
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.mail_campaign_recipients
  where coalesce(btrim(email), '') <> ''
)
update public.mail_campaign_recipients as recipient
set dispatch_key = ranked.campaign_id::text || ':' || ranked.normalized_email
from ranked
where recipient.id = ranked.id
  and ranked.duplicate_rank = 1
  and recipient.dispatch_key is null;

drop index if exists public.mail_campaign_recipients_dispatch_key_uniq;
create unique index mail_campaign_recipients_dispatch_key_uniq
  on public.mail_campaign_recipients (dispatch_key);

-- PostgreSQL autorise plusieurs NULL dans un index unique. Les anciens doublons
-- peuvent donc rester avec dispatch_key = NULL, tandis que toutes les nouvelles
-- lignes sont protegees et utilisables par ON CONFLICT (dispatch_key).

create index if not exists mail_campaigns_resume_idx
  on public.mail_campaigns (status, resume_at, created_at asc);

create index if not exists mail_campaign_recipients_failure_idx
  on public.mail_campaign_recipients (campaign_id, failure_kind, failure_retryable, created_at asc);

-- Reclamation atomique des destinataires. FOR UPDATE SKIP LOCKED evite qu'un
-- second worker prenne les memes lignes, meme si deux executions cron se
-- croisent accidentellement.
create or replace function public.claim_mail_campaign_recipients(
  p_campaign_id uuid,
  p_limit integer default 5,
  p_now timestamptz default clock_timestamp()
)
returns setof public.mail_campaign_recipients
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select recipient.id
    from public.mail_campaign_recipients as recipient
    where recipient.campaign_id = p_campaign_id
      and recipient.status = 'queued'
      and recipient.next_attempt_at <= coalesce(p_now, clock_timestamp())
    order by recipient.created_at asc, recipient.id asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  )
  update public.mail_campaign_recipients as recipient
  set status = 'processing',
      processing_started_at = coalesce(p_now, clock_timestamp()),
      updated_at = coalesce(p_now, clock_timestamp())
  from candidates
  where recipient.id = candidates.id
    and recipient.status = 'queued'
  returning recipient.*;
end;
$$;

revoke all on function public.claim_mail_campaign_recipients(uuid, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_mail_campaign_recipients(uuid, integer, timestamptz)
  to service_role;
