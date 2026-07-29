-- iNrCy — Vérification lecture seule après la migration Pipeline média Étape 2.
-- Ce script ne modifie aucune donnée.

select
  to_regclass('public.pro_media_library') as pro_media_library,
  to_regclass('public.publication_workspaces') as publication_workspaces,
  to_regclass('public.publication_workspace_media') as publication_workspace_media,
  to_regclass('public.media_variants') as media_variants,
  to_regclass('public.media_processing_jobs') as media_processing_jobs;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'pro_media_library',
    'publication_workspaces',
    'publication_workspace_media',
    'media_variants',
    'media_processing_jobs'
  )
order by c.relname;

select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default,
  is_generated
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'pro_media_library' and column_name in (
      'account_id',
      'client_media_key',
      'upload_protocol',
      'upload_status',
      'upload_progress',
      'processing_status',
      'publication_status',
      'canonical_storage_path',
      'pipeline_version'
    ))
    or table_name in (
      'publication_workspaces',
      'publication_workspace_media',
      'media_variants',
      'media_processing_jobs'
    )
  )
order by table_name, ordinal_position;

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'pro_media_library',
    'publication_workspaces',
    'publication_workspace_media',
    'media_variants',
    'media_processing_jobs'
  )
order by tablename, policyname;

select
  upload_status,
  processing_status,
  publication_status,
  pipeline_version,
  count(*) as media_count
from public.pro_media_library
group by upload_status, processing_status, publication_status, pipeline_version
order by media_count desc;

-- La colonne historique user_id doit désormais référencer le compte métier,
-- et non auth.users, afin de prendre en charge les établissements secondaires.
select
  c.conname as constraint_name,
  c.confrelid::regclass as referenced_table,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_attribute a
  on a.attrelid = c.conrelid
 and a.attnum = any(c.conkey)
where c.conrelid = 'public.pro_media_library'::regclass
  and c.contype = 'f'
  and a.attname = 'user_id';
