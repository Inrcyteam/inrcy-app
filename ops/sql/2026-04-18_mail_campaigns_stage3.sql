create extension if not exists pgcrypto;

create table if not exists public.mail_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null,
  provider text not null,
  type text not null default 'mail',
  subject text not null default '(sans objet)',
  body_text text not null default '',
  body_html text,
  attachments jsonb not null default '[]'::jsonb,
  status text not null default 'queued',
  total_count integer not null default 0,
  queued_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  source_doc_save_id text,
  source_doc_type text,
  source_doc_number text,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mail_campaigns_status_check check (status in ('queued', 'processing', 'sent', 'partial', 'failed'))
);

create table if not exists public.mail_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.mail_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid,
  display_name text,
  email text not null,
  status text not null default 'queued',
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mail_campaign_recipients_status_check check (status in ('queued', 'processing', 'sent', 'failed'))
);

create index if not exists mail_campaigns_user_created_idx
  on public.mail_campaigns (user_id, created_at desc);

create index if not exists mail_campaigns_status_created_idx
  on public.mail_campaigns (status, created_at asc);

create index if not exists mail_campaign_recipients_campaign_status_idx
  on public.mail_campaign_recipients (campaign_id, status, created_at asc);

create index if not exists mail_campaign_recipients_user_status_idx
  on public.mail_campaign_recipients (user_id, status, created_at asc);

alter table public.mail_campaigns enable row level security;
alter table public.mail_campaign_recipients enable row level security;

drop policy if exists mail_campaigns_select_own on public.mail_campaigns;
create policy mail_campaigns_select_own
  on public.mail_campaigns
  for select
  using (auth.uid() = user_id);

drop policy if exists mail_campaigns_insert_own on public.mail_campaigns;
create policy mail_campaigns_insert_own
  on public.mail_campaigns
  for insert
  with check (auth.uid() = user_id);

drop policy if exists mail_campaigns_update_own on public.mail_campaigns;
create policy mail_campaigns_update_own
  on public.mail_campaigns
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists mail_campaigns_delete_own on public.mail_campaigns;
create policy mail_campaigns_delete_own
  on public.mail_campaigns
  for delete
  using (auth.uid() = user_id);

drop policy if exists mail_campaign_recipients_select_own on public.mail_campaign_recipients;
create policy mail_campaign_recipients_select_own
  on public.mail_campaign_recipients
  for select
  using (auth.uid() = user_id);

drop policy if exists mail_campaign_recipients_insert_own on public.mail_campaign_recipients;
create policy mail_campaign_recipients_insert_own
  on public.mail_campaign_recipients
  for insert
  with check (auth.uid() = user_id);

drop policy if exists mail_campaign_recipients_update_own on public.mail_campaign_recipients;
create policy mail_campaign_recipients_update_own
  on public.mail_campaign_recipients
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists mail_campaign_recipients_delete_own on public.mail_campaign_recipients;
create policy mail_campaign_recipients_delete_own
  on public.mail_campaign_recipients
  for delete
  using (auth.uid() = user_id);
