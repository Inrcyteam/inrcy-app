-- iNrCy — Pipeline média universel — Étape 5 — vérification lecture seule

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'inrcy_enqueue_image_normalization',
    'inrcy_claim_image_normalization_jobs'
  )
order by p.proname;

select
  job_type,
  status,
  count(*) as jobs
from public.media_processing_jobs
where job_type = 'image_normalize_v1'
group by job_type, status
order by status;

select
  purpose,
  status,
  count(*) as variants
from public.media_variants
where signature in (
  'inrcy:image:canonical:v1',
  'inrcy:image:ai_preview:v1',
  'inrcy:image:thumbnail:v1'
)
group by purpose, status
order by purpose, status;

select
  processing_status,
  publication_status,
  count(*) as images
from public.pro_media_library
where media_type = 'image'
  and pipeline_version >= 1
group by processing_status, publication_status
order by processing_status, publication_status;
