-- iNrCy — Pipeline média universel — Étape 8 — Vérification en lecture seule
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
    'media_variants_channel_publish_lookup_idx',
    'publication_workspaces_cutover_lifecycle_idx'
  )
order by indexname;

select
  status,
  count(*) as workspace_count
from public.publication_workspaces
where status in ('ready', 'scheduled', 'publishing', 'published', 'failed')
group by status
order by status;

select
  channel,
  status,
  count(*) as variant_count
from public.media_variants
where purpose = 'channel_publish'
group by channel, status
order by channel nulls first, status;
