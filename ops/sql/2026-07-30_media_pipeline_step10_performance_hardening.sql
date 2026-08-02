-- iNrCy — Pipeline média, étape 10
-- Limites produit réelles, écritures exclusivement serveur et garde-fou de scope.

begin;

update storage.buckets
set
  file_size_limit = 314572800,
  allowed_mime_types = array[
    'image/jpeg',
    'image/jpg',
    'image/x-png',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/heic',
    'image/heif',
    'image/heic-sequence',
    'image/heif-sequence',
    'image/tif',
    'image/tiff',
    'image/bmp',
    'image/x-bmp',
    'image/x-ms-bmp',
    'video/mp4',
    'video/quicktime',
    'video/x-m4v',
    'video/webm',
    'video/mpeg',
    'video/x-msvideo',
    'video/x-matroska',
    'video/3gpp',
    'video/3gpp2',
    'video/mp2t',
    'video/x-ms-wmv',
    'video/x-flv',
    'video/ogg',
    'audio/mpeg'
  ]::text[]
where id = 'inrcy-pro-media';

-- Le bucket de publication ne reçoit plus de source supérieure à 300 Mo.
-- Sa liste MIME historique reste inchangée pour ne pas casser d'autres modules.
update storage.buckets
set file_size_limit = 314572800
where id = 'booster';

-- Canonical videos created before this step could reach 94 MiB. Requeue the
-- oversized rows so the new worker brings them below 39 MiB before publishing.
update public.media_variants
set
  status = 'pending',
  error_code = null,
  error_message = null,
  ready_at = null,
  updated_at = now()
where purpose = 'canonical'
  and signature = 'inrcy:video:canonical:v1'
  and status = 'ready'
  and coalesce(size_bytes, 0) > 40894464;

update public.pro_media_library as media
set
  processing_status = 'not_requested',
  processing_progress = 0,
  processing_error_code = null,
  processing_error_message = null,
  processing_completed_at = null,
  publication_status = 'processing',
  updated_at = now()
where media.media_type = 'video'
  and exists (
    select 1
    from public.media_variants as variant
    where variant.media_id = media.id
      and variant.account_id = media.user_id
      and variant.purpose = 'canonical'
      and variant.signature = 'inrcy:video:canonical:v1'
      and variant.status = 'pending'
      and coalesce(variant.size_bytes, 0) > 40894464
  );

update public.media_processing_jobs as job
set
  status = 'queued',
  progress = 0,
  attempt_count = 0,
  available_at = now(),
  completed_at = null,
  locked_at = null,
  lock_expires_at = null,
  locked_by = null,
  error_code = null,
  error_message = null,
  updated_at = now()
where job.job_type = 'video_normalize_v1'
  and job.status <> 'processing'
  and exists (
    select 1
    from public.media_variants as variant
    where variant.media_id = job.media_id
      and variant.account_id = job.account_id
      and variant.purpose = 'canonical'
      and variant.signature = 'inrcy:video:canonical:v1'
      and variant.status = 'pending'
      and coalesce(variant.size_bytes, 0) > 40894464
  );

-- Les clients chargent uniquement à l'aide d'un jeton signé délivré par l'API.
-- Supprimer ces policies ferme le contournement des limites du produit.
drop policy if exists "inrcy_pro_media_insert_own" on storage.objects;
drop policy if exists "inrcy_pro_media_update_own" on storage.objects;
drop policy if exists "inrcy_pro_media_delete_own" on storage.objects;

-- Le registre contient des états worker et des chemins de stockage sensibles :
-- il reste lisible, mais toutes ses mutations passent par les routes serveur.
revoke insert, update, delete on public.pro_media_library from authenticated;
grant select on public.pro_media_library to authenticated;
drop policy if exists "pro_media_library_insert_own" on public.pro_media_library;
drop policy if exists "pro_media_library_update_own" on public.pro_media_library;
drop policy if exists "pro_media_library_delete_own" on public.pro_media_library;

create or replace function public.inrcy_validate_media_storage_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_private_prefix text;
  v_public_prefix text;
begin
  v_private_prefix := 'users/' || new.user_id::text || '/';
  v_public_prefix := new.user_id::text || '/';

  if new.bucket_name = 'inrcy-pro-media'
     and new.storage_path not like v_private_prefix || '%' then
    raise exception 'INRCY_MEDIA_SOURCE_SCOPE_INVALID'
      using errcode = 'P0001';
  end if;

  if new.bucket_name = 'booster'
     and new.storage_path not like v_public_prefix || '%' then
    raise exception 'INRCY_MEDIA_PUBLIC_SCOPE_INVALID'
      using errcode = 'P0001';
  end if;

  if new.canonical_bucket_name = 'inrcy-pro-media'
     and new.canonical_storage_path is not null
     and new.canonical_storage_path not like v_private_prefix || '%' then
    raise exception 'INRCY_MEDIA_CANONICAL_SCOPE_INVALID'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.inrcy_validate_media_storage_scope() from public;
grant execute on function public.inrcy_validate_media_storage_scope() to service_role;

drop trigger if exists pro_media_library_validate_storage_scope
  on public.pro_media_library;
create trigger pro_media_library_validate_storage_scope
before insert or update of
  user_id,
  bucket_name,
  storage_path,
  canonical_bucket_name,
  canonical_storage_path
on public.pro_media_library
for each row execute function public.inrcy_validate_media_storage_scope();

comment on function public.inrcy_validate_media_storage_scope() is
  'Empêche tout chemin média de sortir du préfixe du compte, même via une future route serveur défectueuse.';

commit;
