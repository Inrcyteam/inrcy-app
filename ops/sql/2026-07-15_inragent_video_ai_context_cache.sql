-- iNrAgent Lot C : contexte vidéo IA persistant dans la médiathèque.
-- À exécuter une seule fois dans Supabase SQL Editor avant le déploiement du Lot C.

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

comment on column public.pro_media_library.ai_status is
  'État du contexte vidéo iNrAgent : ready, partial ou unavailable.';
comment on column public.pro_media_library.ai_transcript is
  'Transcription nettoyée utilisée comme contexte rédactionnel iNrAgent.';
comment on column public.pro_media_library.ai_frame_paths is
  'Chemins Storage privés des trois captures IA dérivées de la vidéo.';
comment on column public.pro_media_library.ai_preparation_version is
  'Version du pipeline de préparation vidéo permettant une régénération contrôlée.';
comment on column public.pro_media_library.ai_source_fingerprint is
  'Empreinte de la source vidéo et de ses métadonnées pour invalider un contexte obsolète.';
