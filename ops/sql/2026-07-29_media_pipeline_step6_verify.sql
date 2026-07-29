-- iNrCy — Pipeline média universel — Étape 6 — contrôle lecture seule.

select
  to_regprocedure('public.inrcy_enqueue_video_normalization(uuid,uuid,uuid,integer)') is not null
    as enqueue_function_present,
  to_regprocedure('public.inrcy_claim_video_normalization_jobs(text,integer,integer)') is not null
    as claim_function_present;

select
  routine_name,
  security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'inrcy_enqueue_video_normalization',
    'inrcy_claim_video_normalization_jobs'
  )
order by routine_name;

select
  has_function_privilege(
    'anon',
    'public.inrcy_enqueue_video_normalization(uuid,uuid,uuid,integer)',
    'EXECUTE'
  ) as anon_can_enqueue,
  has_function_privilege(
    'authenticated',
    'public.inrcy_enqueue_video_normalization(uuid,uuid,uuid,integer)',
    'EXECUTE'
  ) as authenticated_can_enqueue,
  has_function_privilege(
    'service_role',
    'public.inrcy_enqueue_video_normalization(uuid,uuid,uuid,integer)',
    'EXECUTE'
  ) as service_role_can_enqueue;

select
  job_type,
  status,
  count(*) as job_count,
  min(available_at) as oldest_available_at,
  max(attempt_count) as max_attempt_count_seen
from public.media_processing_jobs
where job_type = 'video_normalize_v1'
group by job_type, status
order by status;

select
  purpose,
  signature,
  status,
  count(*) as variant_count
from public.media_variants
where signature like 'inrcy:video:%:v1'
group by purpose, signature, status
order by signature, status;

select
  id as bucket_id,
  public,
  file_size_limit,
  allowed_mime_types is null
    or 'audio/mpeg' = any(allowed_mime_types) as audio_mpeg_allowed
from storage.buckets
where id = 'inrcy-pro-media';
