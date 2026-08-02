-- Vérification en lecture seule après l'étape 10.

select
  id,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id in ('booster', 'inrcy-pro-media')
order by id;

select
  policyname,
  cmd,
  roles
from pg_policies
where
  (schemaname = 'storage' and tablename = 'objects'
    and policyname like 'inrcy_pro_media_%')
  or
  (schemaname = 'public' and tablename = 'pro_media_library')
order by schemaname, tablename, policyname;

select
  has_table_privilege('authenticated', 'public.pro_media_library', 'select')
    as authenticated_can_select,
  has_table_privilege('authenticated', 'public.pro_media_library', 'insert')
    as authenticated_can_insert,
  has_table_privilege('authenticated', 'public.pro_media_library', 'update')
    as authenticated_can_update,
  has_table_privilege('authenticated', 'public.pro_media_library', 'delete')
    as authenticated_can_delete;

select
  count(*) filter (
    where bucket_name = 'inrcy-pro-media'
      and storage_path not like 'users/' || user_id::text || '/%'
  ) as invalid_private_sources,
  count(*) filter (
    where bucket_name = 'booster'
      and storage_path not like user_id::text || '/%'
  ) as invalid_public_sources
from public.pro_media_library;

select
  count(*) as oversized_ready_video_canonicals
from public.media_variants
where purpose = 'canonical'
  and signature = 'inrcy:video:canonical:v1'
  and status = 'ready'
  and coalesce(size_bytes, 0) > 40894464;
