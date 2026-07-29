-- iNrCy — Pipeline média universel — Étape 7 — Vérification en lecture seule
-- Ce script ne modifie aucune donnée.

select
  to_regclass('public.publication_workspaces') as publication_workspaces,
  to_regclass('public.publication_workspace_media') as publication_workspace_media,
  to_regclass('public.pro_media_library') as pro_media_library,
  to_regclass('public.media_variants') as media_variants;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'publication_workspace_media_workspace_position_media_idx',
    'media_variants_ready_consumption_idx',
    'publication_workspaces_account_lifecycle_idx'
  )
order by indexname;

select
  status,
  count(*) as workspace_count
from public.publication_workspaces
group by status
order by status;

select
  purpose,
  status,
  count(*) as variant_count
from public.media_variants
where purpose in ('canonical', 'ai_preview', 'thumbnail', 'video_frame', 'audio_track')
group by purpose, status
order by purpose, status;
