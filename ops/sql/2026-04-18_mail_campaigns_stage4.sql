alter table public.mail_campaigns
  add column if not exists processing_count integer not null default 0,
  add column if not exists last_activity_at timestamptz not null default now();

alter table public.mail_campaign_recipients
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists processing_started_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists provider_message_id text,
  add column if not exists last_error text;

update public.mail_campaigns
set processing_count = 0
where processing_count is null;

update public.mail_campaigns
set last_activity_at = coalesce(updated_at, created_at, now())
where last_activity_at is null;

update public.mail_campaign_recipients
set attempt_count = coalesce(attempt_count, 0),
    max_attempts = coalesce(max_attempts, 3),
    next_attempt_at = coalesce(next_attempt_at, created_at, now()),
    last_error = coalesce(last_error, error)
where attempt_count is null
   or max_attempts is null
   or next_attempt_at is null
   or (last_error is null and error is not null);

create index if not exists mail_campaign_recipients_campaign_retry_idx
  on public.mail_campaign_recipients (campaign_id, status, next_attempt_at, created_at asc);

create index if not exists mail_campaign_recipients_status_retry_idx
  on public.mail_campaign_recipients (status, next_attempt_at, created_at asc);
