-- Lecture seule — contrôle après la migration Étape 3.

select
  id,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id in ('booster', 'inrcy-pro-media')
order by id;

-- Résultat attendu :
-- 2 lignes ; file_size_limit >= 5368709120 ; allowed_mime_types = NULL.

select
  count(*) filter (where upload_protocol = 'signed') as signed_uploads,
  count(*) filter (where upload_protocol = 'tus') as tus_uploads,
  count(*) filter (where upload_status = 'uploading') as uploading,
  count(*) filter (where upload_status = 'uploaded') as uploaded,
  count(*) filter (where upload_status = 'failed') as failed
from public.pro_media_library
where pipeline_version >= 1;
