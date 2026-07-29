-- iNrCy — Pipeline média universel — Étape 9
-- Certification finale strictement en lecture seule.
-- Exécuter après les vérifications des Étapes 2 à 8.

-- 1) Socle de tables.
with expected(object_name) as (
  values
    ('public.pro_media_library'),
    ('public.publication_workspaces'),
    ('public.publication_workspace_media'),
    ('public.media_variants'),
    ('public.media_processing_jobs')
)
select
  'table' as component_type,
  object_name,
  to_regclass(object_name) is not null as present
from expected
order by object_name;

-- 2) Fonctions worker et cohérence.
with expected(object_name) as (
  values
    ('public.inrcy_can_access_publication_workspace(uuid)'),
    ('public.inrcy_enqueue_image_normalization(uuid,uuid,uuid,integer)'),
    ('public.inrcy_claim_image_normalization_jobs(text,integer,integer)'),
    ('public.inrcy_enqueue_video_normalization(uuid,uuid,uuid,integer)'),
    ('public.inrcy_claim_video_normalization_jobs(text,integer,integer)')
)
select
  'function' as component_type,
  object_name,
  to_regprocedure(object_name) is not null as present
from expected
order by object_name;

-- 3) Index indispensables au registre, aux workers et à la publication.
with expected(index_name) as (
  values
    ('pro_media_library_account_client_media_key_uidx'),
    ('pro_media_library_processing_queue_idx'),
    ('publication_workspaces_account_client_key_uidx'),
    ('publication_workspaces_status_schedule_idx'),
    ('publication_workspace_media_workspace_position_media_idx'),
    ('media_variants_signature_uidx'),
    ('media_variants_ready_consumption_idx'),
    ('media_variants_channel_publish_lookup_idx'),
    ('media_processing_jobs_idempotency_uidx'),
    ('media_processing_jobs_claim_idx'),
    ('publication_workspaces_cutover_lifecycle_idx')
)
select
  'index' as component_type,
  expected.index_name as object_name,
  pg_indexes.indexname is not null as present
from expected
left join pg_indexes
  on pg_indexes.schemaname = 'public'
 and pg_indexes.indexname = expected.index_name
order by expected.index_name;

-- 4) Stockage attendu. inrcy-pro-media doit rester privé.
select
  'bucket' as component_type,
  id as object_name,
  true as present,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id in ('booster', 'inrcy-pro-media')
order by id;

-- 5) RLS des tables nouvelles.
select
  'rls' as component_type,
  n.nspname || '.' || c.relname as object_name,
  c.relrowsecurity as present
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'publication_workspaces',
    'publication_workspace_media',
    'media_variants',
    'media_processing_jobs'
  )
order by c.relname;

-- 6) État opérationnel des jobs.
select
  count(*) filter (where status = 'queued' and available_at <= current_timestamp) as jobs_queued_ready,
  count(*) filter (where status = 'retry_wait' and available_at <= current_timestamp) as jobs_retry_ready,
  count(*) filter (
    where status = 'processing'
      and lock_expires_at is not null
      and lock_expires_at < current_timestamp
  ) as jobs_processing_lease_expired,
  count(*) filter (
    where status = 'failed'
      and updated_at >= current_timestamp - interval '24 hours'
  ) as jobs_failed_24h
from public.media_processing_jobs;

-- 7) État opérationnel des workspaces.
select
  count(*) filter (where status = 'waiting_media') as workspaces_waiting_media,
  count(*) filter (
    where status = 'waiting_media'
      and updated_at < current_timestamp - interval '30 minutes'
  ) as workspaces_waiting_media_stale,
  count(*) filter (
    where status = 'publishing'
      and updated_at < current_timestamp - interval '30 minutes'
  ) as workspaces_publishing_stale,
  count(*) filter (
    where status = 'failed'
      and updated_at >= current_timestamp - interval '24 hours'
  ) as workspaces_failed_24h
from public.publication_workspaces;

-- 8) État opérationnel des variantes.
select
  count(*) filter (where status = 'pending') as variants_pending,
  count(*) filter (
    where status = 'processing'
      and updated_at < current_timestamp - interval '30 minutes'
  ) as variants_processing_stale,
  count(*) filter (
    where status = 'failed'
      and updated_at >= current_timestamp - interval '24 hours'
  ) as variants_failed_24h,
  count(*) filter (where status = 'ready' and purpose = 'canonical') as canonical_ready,
  count(*) filter (where status = 'ready' and purpose = 'ai_preview') as ai_preview_ready
from public.media_variants;
