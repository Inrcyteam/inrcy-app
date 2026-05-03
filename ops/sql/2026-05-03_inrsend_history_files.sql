-- iNr'Send — documents envoyés téléchargeables dans le détail d'envoi
-- À exécuter dans Supabase SQL Editor.

create extension if not exists pgcrypto;

-- Bucket privé utilisé par iNr'Send / factures / devis.
-- Il existe peut-être déjà : on le garde et on force juste le mode privé.
insert into storage.buckets (id, name, public, file_size_limit)
values ('inrbox_attachments', 'inrbox_attachments', false, 52428800)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800;

create table if not exists public.inrsend_history_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  history_source text not null check (history_source in ('send_items', 'mail_campaigns', 'app_events')),
  history_id uuid not null,
  category text not null default 'mails',
  file_role text not null default 'attachment' check (file_role in ('attachment', 'invoice_pdf', 'quote_pdf', 'publication_media', 'generated_document')),
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  storage_bucket text not null default 'inrbox_attachments',
  storage_path text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inrsend_history_files_unique_file unique (user_id, history_source, history_id, storage_bucket, storage_path)
);

create index if not exists inrsend_history_files_user_history_idx
  on public.inrsend_history_files (user_id, history_source, history_id);

create index if not exists inrsend_history_files_created_at_idx
  on public.inrsend_history_files (created_at desc);

alter table public.inrsend_history_files enable row level security;

drop policy if exists "inrsend_history_files_select_own" on public.inrsend_history_files;
create policy "inrsend_history_files_select_own"
  on public.inrsend_history_files
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "inrsend_history_files_insert_own" on public.inrsend_history_files;
create policy "inrsend_history_files_insert_own"
  on public.inrsend_history_files
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "inrsend_history_files_update_own" on public.inrsend_history_files;
create policy "inrsend_history_files_update_own"
  on public.inrsend_history_files
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "inrsend_history_files_delete_own" on public.inrsend_history_files;
create policy "inrsend_history_files_delete_own"
  on public.inrsend_history_files
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Storage RLS : les nouveaux fichiers doivent être rangés sous :
-- <auth.uid()>/mail-attachments/...
-- <auth.uid()>/factures/...
-- <auth.uid()>/devis/...
-- Le code fourni suit ce format.

drop policy if exists "inrbox_attachments_select_own" on storage.objects;
create policy "inrbox_attachments_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'inrbox_attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "inrbox_attachments_insert_own" on storage.objects;
create policy "inrbox_attachments_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'inrbox_attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "inrbox_attachments_update_own" on storage.objects;
create policy "inrbox_attachments_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'inrbox_attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'inrbox_attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "inrbox_attachments_delete_own" on storage.objects;
create policy "inrbox_attachments_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'inrbox_attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inrsend_history_files_touch_updated_at on public.inrsend_history_files;
create trigger inrsend_history_files_touch_updated_at
before update on public.inrsend_history_files
for each row execute function public.touch_updated_at();

create or replace function public.cleanup_inrsend_history_files_for_send_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.inrsend_history_files
  where user_id = old.user_id
    and history_source = 'send_items'
    and history_id = old.id;
  return old;
end;
$$;

create or replace function public.cleanup_inrsend_history_files_for_mail_campaigns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.inrsend_history_files
  where user_id = old.user_id
    and history_source = 'mail_campaigns'
    and history_id = old.id;
  return old;
end;
$$;

create or replace function public.cleanup_inrsend_history_files_for_app_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.inrsend_history_files
  where user_id = old.user_id
    and history_source = 'app_events'
    and history_id = old.id;
  return old;
end;
$$;

drop trigger if exists send_items_cleanup_inrsend_history_files on public.send_items;
create trigger send_items_cleanup_inrsend_history_files
after delete on public.send_items
for each row execute function public.cleanup_inrsend_history_files_for_send_items();

drop trigger if exists mail_campaigns_cleanup_inrsend_history_files on public.mail_campaigns;
create trigger mail_campaigns_cleanup_inrsend_history_files
after delete on public.mail_campaigns
for each row execute function public.cleanup_inrsend_history_files_for_mail_campaigns();

drop trigger if exists app_events_cleanup_inrsend_history_files on public.app_events;
create trigger app_events_cleanup_inrsend_history_files
after delete on public.app_events
for each row execute function public.cleanup_inrsend_history_files_for_app_events();
