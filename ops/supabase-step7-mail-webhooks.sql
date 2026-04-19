-- Étape 7 iNrCy / iNr'Send
-- Webhooks provider / événements de délivrabilité

create extension if not exists pgcrypto;

alter table public.mail_campaign_recipients
  add column if not exists delivery_status text null check (delivery_status in ('accepted', 'delivered', 'bounced', 'complained', 'unsubscribed')),
  add column if not exists delivery_event text null,
  add column if not exists delivery_last_event_at timestamptz null,
  add column if not exists delivered_at timestamptz null;

create index if not exists mail_campaign_recipients_provider_message_idx
  on public.mail_campaign_recipients (provider_message_id);

create index if not exists mail_campaign_recipients_delivery_status_idx
  on public.mail_campaign_recipients (campaign_id, delivery_status, created_at asc);

create table if not exists public.mail_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  event_type text not null,
  provider_message_id text null,
  email text null,
  payload jsonb not null default '{}'::jsonb,
  matched_campaign_id uuid null references public.mail_campaigns(id) on delete set null,
  matched_recipient_id uuid null references public.mail_campaign_recipients(id) on delete set null,
  processed_at timestamptz null,
  result text null,
  created_at timestamptz not null default now()
);

create unique index if not exists mail_provider_events_provider_external_uniq
  on public.mail_provider_events (provider, external_event_id);

create index if not exists mail_provider_events_message_idx
  on public.mail_provider_events (provider_message_id, created_at desc);

create index if not exists mail_provider_events_email_idx
  on public.mail_provider_events (email, created_at desc);
