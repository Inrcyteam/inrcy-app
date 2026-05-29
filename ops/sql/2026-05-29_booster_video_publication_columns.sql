-- Booster / Publier — champs vidéo pour les publications et articles site.
-- À exécuter dans Supabase SQL Editor avant d'activer l'envoi vidéo final.

alter table if exists public.publications
  add column if not exists media_type text not null default 'images',
  add column if not exists video_url text null,
  add column if not exists video_path text null,
  add column if not exists video_mime text null,
  add column if not exists video_size bigint null,
  add column if not exists video_duration_seconds numeric null,
  add column if not exists video_thumbnail_url text null,
  add column if not exists media_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.site_articles
  add column if not exists media_type text not null default 'images',
  add column if not exists video_url text null,
  add column if not exists video_path text null,
  add column if not exists video_mime text null,
  add column if not exists video_size bigint null,
  add column if not exists video_duration_seconds numeric null,
  add column if not exists video_thumbnail_url text null,
  add column if not exists media_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if to_regclass('public.publications') is not null and not exists (
    select 1
    from pg_constraint
    where conname = 'publications_media_type_check'
      and conrelid = to_regclass('public.publications')
  ) then
    alter table public.publications
      add constraint publications_media_type_check
      check (media_type in ('images', 'video'));
  end if;

  if to_regclass('public.site_articles') is not null and not exists (
    select 1
    from pg_constraint
    where conname = 'site_articles_media_type_check'
      and conrelid = to_regclass('public.site_articles')
  ) then
    alter table public.site_articles
      add constraint site_articles_media_type_check
      check (media_type in ('images', 'video'));
  end if;
end $$;

create index if not exists publications_media_type_idx
  on public.publications (user_id, media_type, created_at desc);

create index if not exists site_articles_media_type_idx
  on public.site_articles (user_id, media_type, created_at desc);
