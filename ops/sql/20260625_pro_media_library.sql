-- Médiathèque professionnelle iNrCy
-- À exécuter dans Supabase SQL Editor avant d’utiliser /dashboard/mediatheque.

-- 1) Bucket privé pour les médias des professionnels
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inrcy-pro-media',
  'inrcy-pro-media',
  false,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-m4v'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2) Table privée des médias du pro
create table if not exists public.pro_media_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_name text not null default 'inrcy-pro-media',
  storage_path text not null,
  media_type text not null check (media_type in ('image', 'video')),
  mime_type text,
  size_bytes bigint not null default 0,
  title text,
  tags text[] not null default '{}',
  source text not null default 'mediatheque',
  width integer,
  height integer,
  duration_seconds numeric,
  ai_status text constraint pro_media_library_ai_status_check check (ai_status is null or ai_status in ('ready', 'partial', 'unavailable')),
  ai_transcript text,
  ai_frame_paths text[] not null default '{}',
  ai_prepared_at timestamptz,
  ai_preparation_version integer,
  ai_source_fingerprint text,
  ai_warnings text[] not null default '{}',
  ai_timings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  usage_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pro_media_library_storage_path_unique unique (storage_path),
  constraint pro_media_library_size_positive check (size_bytes >= 0)
);


-- 2 bis) Contexte vidéo IA persistant pour iNrAgent.
-- Ces ADD COLUMN rendent aussi ce script compatible avec une table déjà créée.
alter table public.pro_media_library
  add column if not exists ai_status text,
  add column if not exists ai_transcript text,
  add column if not exists ai_frame_paths text[] not null default '{}',
  add column if not exists ai_prepared_at timestamptz,
  add column if not exists ai_preparation_version integer,
  add column if not exists ai_source_fingerprint text,
  add column if not exists ai_warnings text[] not null default '{}',
  add column if not exists ai_timings jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pro_media_library_ai_status_check'
      and conrelid = 'public.pro_media_library'::regclass
  ) then
    alter table public.pro_media_library
      add constraint pro_media_library_ai_status_check
      check (ai_status is null or ai_status in ('ready', 'partial', 'unavailable'));
  end if;
end
$$;

create index if not exists pro_media_library_video_ai_status_idx
  on public.pro_media_library (user_id, ai_status, ai_prepared_at desc)
  where media_type = 'video';

create index if not exists pro_media_library_user_created_idx
  on public.pro_media_library (user_id, created_at desc);

create index if not exists pro_media_library_user_type_idx
  on public.pro_media_library (user_id, media_type, is_active);

create index if not exists pro_media_library_tags_idx
  on public.pro_media_library using gin (tags);

-- 3) RLS : chaque pro ne voit que ses médias.
alter table public.pro_media_library enable row level security;

drop policy if exists "pro_media_library_select_own" on public.pro_media_library;
create policy "pro_media_library_select_own"
  on public.pro_media_library
  for select
  using (auth.uid() = user_id);

drop policy if exists "pro_media_library_insert_own" on public.pro_media_library;
create policy "pro_media_library_insert_own"
  on public.pro_media_library
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "pro_media_library_update_own" on public.pro_media_library;
create policy "pro_media_library_update_own"
  on public.pro_media_library
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "pro_media_library_delete_own" on public.pro_media_library;
create policy "pro_media_library_delete_own"
  on public.pro_media_library
  for delete
  using (auth.uid() = user_id);

-- 4) RLS Storage : le chemin doit commencer par users/{auth.uid()}/...
-- Les routes API créent des URLs d’upload signées avec service role.
-- Ces policies permettent aussi un accès propre côté client si besoin plus tard.
drop policy if exists "inrcy_pro_media_select_own" on storage.objects;
create policy "inrcy_pro_media_select_own"
  on storage.objects
  for select
  using (
    bucket_id = 'inrcy-pro-media'
    and auth.uid()::text = (storage.foldername(name))[2]
  );

drop policy if exists "inrcy_pro_media_insert_own" on storage.objects;
create policy "inrcy_pro_media_insert_own"
  on storage.objects
  for insert
  with check (
    bucket_id = 'inrcy-pro-media'
    and (storage.foldername(name))[1] = 'users'
    and auth.uid()::text = (storage.foldername(name))[2]
  );

drop policy if exists "inrcy_pro_media_update_own" on storage.objects;
create policy "inrcy_pro_media_update_own"
  on storage.objects
  for update
  using (
    bucket_id = 'inrcy-pro-media'
    and auth.uid()::text = (storage.foldername(name))[2]
  )
  with check (
    bucket_id = 'inrcy-pro-media'
    and (storage.foldername(name))[1] = 'users'
    and auth.uid()::text = (storage.foldername(name))[2]
  );

drop policy if exists "inrcy_pro_media_delete_own" on storage.objects;
create policy "inrcy_pro_media_delete_own"
  on storage.objects
  for delete
  using (
    bucket_id = 'inrcy-pro-media'
    and auth.uid()::text = (storage.foldername(name))[2]
  );

-- 5) Trigger updated_at
create or replace function public.set_pro_media_library_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_pro_media_library_updated_at on public.pro_media_library;
create trigger set_pro_media_library_updated_at
before update on public.pro_media_library
for each row
execute function public.set_pro_media_library_updated_at();
