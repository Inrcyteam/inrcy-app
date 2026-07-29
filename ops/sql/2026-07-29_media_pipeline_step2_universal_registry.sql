-- iNrCy — Pipeline média universel — Étape 2
-- Registre média, workspaces de publication, variantes et file de traitement.
--
-- Cette migration est additive et idempotente :
--   * elle ne supprime aucune donnée ni aucune colonne historique ;
--   * elle ne change aucun parcours Booster en production ;
--   * public.pro_media_library reste compatible avec le code existant ;
--   * user_id reste la colonne physique historique de l'établissement actif ;
--   * account_id devient un alias généré en lecture pour les nouveaux services.
--
-- Pré-requis :
--   * ops/sql/20260625_pro_media_library.sql
--   * socle multicompte iNrCy avec public.inrcy_accounts
--   * public.inrcy_can_access_account(uuid)

begin;

do $$
begin
  if to_regclass('public.pro_media_library') is null then
    raise exception 'Pré-requis absent : public.pro_media_library doit être créé avant le pipeline média étape 2.';
  end if;

  if to_regclass('public.inrcy_accounts') is null
     or to_regprocedure('public.inrcy_can_access_account(uuid)') is null then
    raise exception 'Pré-requis multicompte absent : appliquer le socle multicompte iNrCy avant le pipeline média étape 2.';
  end if;
end;
$$;

-- Le code multicompte utilise désormais pro_media_library.user_id comme UUID
-- d'établissement actif. L'ancienne table le référençait encore à auth.users.
-- On refuse la migration si une ligne ne possède pas son compte métier associé.
do $$
begin
  if exists (
    select 1
    from public.pro_media_library m
    left join public.inrcy_accounts a on a.id = m.user_id
    where a.id is null
  ) then
    raise exception 'Pré-requis de cohérence absent : chaque pro_media_library.user_id doit exister dans public.inrcy_accounts.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Évolution additive de pro_media_library vers un registre universel.
-- ---------------------------------------------------------------------------

alter table public.pro_media_library
  add column if not exists account_id uuid generated always as (user_id) stored,
  add column if not exists created_by_auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists original_file_name text,
  add column if not exists detected_mime_type text,
  add column if not exists content_hash_sha256 text,
  add column if not exists client_media_key text,
  add column if not exists upload_protocol text,
  add column if not exists upload_status text not null default 'uploaded',
  add column if not exists upload_progress smallint not null default 100,
  add column if not exists processing_status text not null default 'not_requested',
  add column if not exists publication_status text not null default 'legacy_ready',
  add column if not exists processing_progress smallint not null default 0,
  add column if not exists pipeline_version integer not null default 0,
  add column if not exists canonical_bucket_name text,
  add column if not exists canonical_storage_path text,
  add column if not exists canonical_mime_type text,
  add column if not exists canonical_size_bytes bigint,
  add column if not exists upload_error_code text,
  add column if not exists upload_error_message text,
  add column if not exists upload_started_at timestamptz,
  add column if not exists processing_error_code text,
  add column if not exists processing_error_message text,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_completed_at timestamptz,
  add column if not exists uploaded_at timestamptz,
  add column if not exists original_retention_until timestamptz,
  add column if not exists original_deleted_at timestamptz,
  add column if not exists media_metadata jsonb not null default '{}'::jsonb;

-- Bascule sûre de la clé historique vers le compte métier.
-- Les comptes principaux conservent le même UUID que auth.users ; les
-- établissements secondaires peuvent désormais posséder leurs propres médias.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any(c.conkey)
    where c.conrelid = 'public.pro_media_library'::regclass
      and c.contype = 'f'
      and a.attname = 'user_id'
      and c.confrelid = 'auth.users'::regclass
  loop
    execute format(
      'alter table public.pro_media_library drop constraint %I',
      v_constraint.conname
    );
  end loop;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pro_media_library_user_id_account_fkey'
      and conrelid = 'public.pro_media_library'::regclass
  ) then
    alter table public.pro_media_library
      add constraint pro_media_library_user_id_account_fkey
      foreign key (user_id)
      references public.inrcy_accounts(id)
      on delete cascade
      not valid;
  end if;
end;
$$;

alter table public.pro_media_library
  validate constraint pro_media_library_user_id_account_fkey;

-- Les lignes historiques représentent déjà des fichiers finalisés dans Storage.
update public.pro_media_library
set uploaded_at = coalesce(uploaded_at, created_at)
where uploaded_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pro_media_library_upload_status_check'
      and conrelid = 'public.pro_media_library'::regclass
  ) then
    alter table public.pro_media_library
      add constraint pro_media_library_upload_status_check
      check (upload_status in ('pending', 'uploading', 'uploaded', 'failed', 'removed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pro_media_library_upload_protocol_check'
      and conrelid = 'public.pro_media_library'::regclass
  ) then
    alter table public.pro_media_library
      add constraint pro_media_library_upload_protocol_check
      check (upload_protocol is null or upload_protocol in ('signed', 'tus', 'server_legacy'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pro_media_library_upload_progress_check'
      and conrelid = 'public.pro_media_library'::regclass
  ) then
    alter table public.pro_media_library
      add constraint pro_media_library_upload_progress_check
      check (upload_progress between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pro_media_library_processing_status_check'
      and conrelid = 'public.pro_media_library'::regclass
  ) then
    alter table public.pro_media_library
      add constraint pro_media_library_processing_status_check
      check (processing_status in (
        'not_requested',
        'queued',
        'processing',
        'ready',
        'failed_retryable',
        'failed_terminal'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pro_media_library_publication_status_check'
      and conrelid = 'public.pro_media_library'::regclass
  ) then
    alter table public.pro_media_library
      add constraint pro_media_library_publication_status_check
      check (publication_status in (
        'legacy_ready',
        'not_requested',
        'processing',
        'ready',
        'failed',
        'removed'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pro_media_library_processing_progress_check'
      and conrelid = 'public.pro_media_library'::regclass
  ) then
    alter table public.pro_media_library
      add constraint pro_media_library_processing_progress_check
      check (processing_progress between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pro_media_library_pipeline_version_check'
      and conrelid = 'public.pro_media_library'::regclass
  ) then
    alter table public.pro_media_library
      add constraint pro_media_library_pipeline_version_check
      check (pipeline_version >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pro_media_library_canonical_size_check'
      and conrelid = 'public.pro_media_library'::regclass
  ) then
    alter table public.pro_media_library
      add constraint pro_media_library_canonical_size_check
      check (canonical_size_bytes is null or canonical_size_bytes >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pro_media_library_hash_check'
      and conrelid = 'public.pro_media_library'::regclass
  ) then
    alter table public.pro_media_library
      add constraint pro_media_library_hash_check
      check (
        content_hash_sha256 is null
        or content_hash_sha256 ~ '^[0-9a-f]{64}$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pro_media_library_metadata_object_check'
      and conrelid = 'public.pro_media_library'::regclass
  ) then
    alter table public.pro_media_library
      add constraint pro_media_library_metadata_object_check
      check (jsonb_typeof(media_metadata) = 'object');
  end if;
end;
$$;

create unique index if not exists pro_media_library_account_client_media_key_uidx
  on public.pro_media_library (account_id, client_media_key)
  where client_media_key is not null and length(btrim(client_media_key)) > 0;

create index if not exists pro_media_library_account_lifecycle_idx
  on public.pro_media_library (
    account_id,
    upload_status,
    processing_status,
    publication_status,
    updated_at desc
  );

create index if not exists pro_media_library_processing_queue_idx
  on public.pro_media_library (processing_status, updated_at)
  where processing_status in ('queued', 'processing', 'failed_retryable');

create unique index if not exists pro_media_library_canonical_storage_unique_idx
  on public.pro_media_library (canonical_bucket_name, canonical_storage_path)
  where canonical_storage_path is not null;

comment on column public.pro_media_library.user_id is
  'Colonne historique conservée pour compatibilité. Depuis le multicompte, elle contient l''UUID de l''établissement iNrCy actif.';
comment on column public.pro_media_library.account_id is
  'Alias généré en lecture de user_id. Les écritures historiques continuent de renseigner user_id jusqu''à la bascule finale du pipeline.';
comment on column public.pro_media_library.storage_path is
  'Chemin Storage de la source originale. Aucun nouveau service ne doit remplacer cette source pendant la normalisation.';
comment on column public.pro_media_library.canonical_storage_path is
  'Chemin de la version universelle normalisée par le futur worker média.';
comment on column public.pro_media_library.client_media_key is
  'Clé stable créée par le navigateur pour dédupliquer la création d''un média lors des reprises réseau.';
comment on column public.pro_media_library.upload_protocol is
  'Transport utilisé pour la source : signed, tus ou server_legacy.';
comment on column public.pro_media_library.upload_status is
  'Cycle de transport de la source : pending, uploading, uploaded, failed ou removed.';
comment on column public.pro_media_library.upload_progress is
  'Progression persistante de l''upload, comprise entre 0 et 100.';
comment on column public.pro_media_library.processing_status is
  'Cycle de normalisation asynchrone du média.';
comment on column public.pro_media_library.publication_status is
  'Disponibilité du média pour publication. legacy_ready conserve la compatibilité des médias historiques.';
comment on column public.pro_media_library.pipeline_version is
  'Version du pipeline ayant préparé le média. 0 identifie le comportement historique.';

-- ---------------------------------------------------------------------------
-- 2) Workspace persistant partagé par Générer / Programmer / Publier.
-- ---------------------------------------------------------------------------

create table if not exists public.publication_workspaces (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.inrcy_accounts(id) on delete cascade,
  created_by_auth_user_id uuid references auth.users(id) on delete set null,
  client_workspace_key text,
  source_module text not null default 'booster',
  status text not null default 'draft',
  idea text,
  theme text,
  generated_content jsonb not null default '{}'::jsonb,
  selected_channels text[] not null default '{}',
  generation_options jsonb not null default '{}'::jsonb,
  workspace_metadata jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  last_opened_at timestamptz,
  scheduled_for timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publication_workspaces_status_check check (status in (
    'draft',
    'active',
    'waiting_media',
    'ready',
    'scheduled',
    'publishing',
    'published',
    'failed',
    'archived'
  )),
  constraint publication_workspaces_source_check check (length(btrim(source_module)) > 0),
  constraint publication_workspaces_revision_check check (revision >= 1),
  constraint publication_workspaces_generated_content_object_check
    check (jsonb_typeof(generated_content) = 'object'),
  constraint publication_workspaces_generation_options_object_check
    check (jsonb_typeof(generation_options) = 'object'),
  constraint publication_workspaces_metadata_object_check
    check (jsonb_typeof(workspace_metadata) = 'object')
);

create unique index if not exists publication_workspaces_account_client_key_uidx
  on public.publication_workspaces (account_id, client_workspace_key)
  where client_workspace_key is not null and length(btrim(client_workspace_key)) > 0;

create index if not exists publication_workspaces_account_updated_idx
  on public.publication_workspaces (account_id, updated_at desc);

create index if not exists publication_workspaces_status_schedule_idx
  on public.publication_workspaces (status, scheduled_for)
  where status in ('waiting_media', 'ready', 'scheduled', 'publishing');

comment on table public.publication_workspaces is
  'Espace de travail persistant unique pour un contenu Booster, indépendamment du moment où les médias sont ajoutés.';
comment on column public.publication_workspaces.client_workspace_key is
  'Clé d''idempotence fournie par le client pour éviter la création de workspaces en double.';

-- ---------------------------------------------------------------------------
-- 3) Association ordonnée entre un workspace et ses médias.
-- ---------------------------------------------------------------------------

create table if not exists public.publication_workspace_media (
  workspace_id uuid not null references public.publication_workspaces(id) on delete cascade,
  media_id uuid not null references public.pro_media_library(id) on delete cascade,
  position smallint not null,
  media_role text not null default 'primary',
  selected_channels text[] not null default '{}',
  media_settings jsonb not null default '{}'::jsonb,
  channel_settings jsonb not null default '{}'::jsonb,
  added_by_auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, media_id),
  constraint publication_workspace_media_position_unique unique (workspace_id, position),
  constraint publication_workspace_media_position_check check (position between 0 and 4),
  constraint publication_workspace_media_role_check check (media_role in ('primary', 'secondary', 'cover')),
  constraint publication_workspace_media_settings_object_check check (jsonb_typeof(media_settings) = 'object'),
  constraint publication_workspace_channel_settings_object_check check (jsonb_typeof(channel_settings) = 'object')
);

create index if not exists publication_workspace_media_media_idx
  on public.publication_workspace_media (media_id, workspace_id);

comment on table public.publication_workspace_media is
  'Liaison ordonnée. Le trigger impose le contrat produit : maximum 5 images ou exactement 1 vidéo, sans mélange.';

-- ---------------------------------------------------------------------------
-- 4) Variantes générées : canonique, IA, miniature et canaux.
-- ---------------------------------------------------------------------------

create table if not exists public.media_variants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.inrcy_accounts(id) on delete cascade,
  media_id uuid not null references public.pro_media_library(id) on delete cascade,
  workspace_id uuid references public.publication_workspaces(id) on delete cascade,
  purpose text not null,
  channel text,
  signature text,
  status text not null default 'pending',
  bucket_name text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  width integer,
  height integer,
  duration_seconds numeric,
  pipeline_version integer not null default 1,
  transform_spec jsonb not null default '{}'::jsonb,
  variant_metadata jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  ready_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_variants_purpose_check check (length(btrim(purpose)) > 0),
  constraint media_variants_status_check check (status in ('pending', 'processing', 'ready', 'failed', 'removed')),
  constraint media_variants_size_check check (size_bytes is null or size_bytes >= 0),
  constraint media_variants_width_check check (width is null or width > 0),
  constraint media_variants_height_check check (height is null or height > 0),
  constraint media_variants_duration_check check (duration_seconds is null or duration_seconds >= 0),
  constraint media_variants_pipeline_version_check check (pipeline_version >= 1),
  constraint media_variants_transform_spec_object_check check (jsonb_typeof(transform_spec) = 'object'),
  constraint media_variants_metadata_object_check check (jsonb_typeof(variant_metadata) = 'object'),
  constraint media_variants_storage_pair_check check (
    (bucket_name is null and storage_path is null)
    or (bucket_name is not null and storage_path is not null)
  ),
  constraint media_variants_storage_unique unique (bucket_name, storage_path)
);

create unique index if not exists media_variants_signature_uidx
  on public.media_variants (
    media_id,
    coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid),
    purpose,
    coalesce(channel, ''),
    signature
  )
  where signature is not null and length(btrim(signature)) > 0;

create index if not exists media_variants_media_purpose_idx
  on public.media_variants (media_id, purpose, channel, status, updated_at desc);

create index if not exists media_variants_workspace_idx
  on public.media_variants (workspace_id, status, updated_at desc)
  where workspace_id is not null;

comment on table public.media_variants is
  'Versions dérivées d''un média : canonical, ai_preview, thumbnail, channel_publish, frame, audio_track ou autre purpose versionné.';

-- ---------------------------------------------------------------------------
-- 5) File persistante de traitements média.
-- ---------------------------------------------------------------------------

create table if not exists public.media_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.inrcy_accounts(id) on delete cascade,
  media_id uuid not null references public.pro_media_library(id) on delete cascade,
  workspace_id uuid references public.publication_workspaces(id) on delete cascade,
  variant_id uuid references public.media_variants(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued',
  priority integer not null default 100,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  progress smallint not null default 0,
  idempotency_key text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  lock_expires_at timestamptz,
  locked_by text,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_processing_jobs_type_check check (length(btrim(job_type)) > 0),
  constraint media_processing_jobs_status_check check (status in (
    'queued',
    'processing',
    'retry_wait',
    'succeeded',
    'failed',
    'cancelled'
  )),
  constraint media_processing_jobs_attempt_check check (
    attempt_count >= 0 and max_attempts >= 1 and attempt_count <= max_attempts
  ),
  constraint media_processing_jobs_progress_check check (progress between 0 and 100),
  constraint media_processing_jobs_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint media_processing_jobs_result_object_check check (jsonb_typeof(result) = 'object')
);

create unique index if not exists media_processing_jobs_idempotency_uidx
  on public.media_processing_jobs (account_id, idempotency_key)
  where idempotency_key is not null and length(btrim(idempotency_key)) > 0;

create index if not exists media_processing_jobs_claim_idx
  on public.media_processing_jobs (status, available_at, priority desc, created_at)
  where status in ('queued', 'retry_wait');

create index if not exists media_processing_jobs_media_idx
  on public.media_processing_jobs (media_id, status, created_at desc);

comment on table public.media_processing_jobs is
  'File persistante et idempotente consommée par le futur worker Sharp / FFmpeg. Les clients authentifiés sont en lecture seule.';

-- ---------------------------------------------------------------------------
-- 6) Fonctions de cohérence et contrat 5 images OU 1 vidéo.
-- ---------------------------------------------------------------------------

create or replace function public.inrcy_media_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.inrcy_media_touch_updated_at() from public, anon, authenticated;
grant execute on function public.inrcy_media_touch_updated_at() to authenticated, service_role;

create or replace function public.inrcy_media_guard_account_scope()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'pro_media_library' and new.user_id is distinct from old.user_id then
    raise exception 'INRCY_MEDIA_ACCOUNT_IMMUTABLE' using errcode = 'P0001';
  end if;

  if tg_table_name = 'publication_workspaces' and new.account_id is distinct from old.account_id then
    raise exception 'INRCY_WORKSPACE_ACCOUNT_IMMUTABLE' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.inrcy_media_guard_account_scope() from public, anon, authenticated;
grant execute on function public.inrcy_media_guard_account_scope() to authenticated, service_role;

create or replace function public.inrcy_can_access_publication_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.publication_workspaces w
    where w.id = p_workspace_id
      and public.inrcy_can_access_account(w.account_id)
  );
$$;

revoke all on function public.inrcy_can_access_publication_workspace(uuid) from public, anon;
grant execute on function public.inrcy_can_access_publication_workspace(uuid) to authenticated, service_role;

create or replace function public.inrcy_validate_publication_workspace_media()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_account_id uuid;
  v_media_account_id uuid;
  v_media_type text;
  v_media_active boolean;
  v_upload_status text;
  v_existing_count integer := 0;
  v_has_video boolean := false;
begin
  -- Sérialise les modifications d'un même workspace pour garantir le maximum
  -- de 5 images même si plusieurs uploads se terminent en parallèle.
  perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text, 0));

  select w.account_id
  into v_workspace_account_id
  from public.publication_workspaces w
  where w.id = new.workspace_id;

  if v_workspace_account_id is null then
    raise exception 'INRCY_MEDIA_WORKSPACE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select m.user_id, m.media_type, m.is_active, m.upload_status
  into v_media_account_id, v_media_type, v_media_active, v_upload_status
  from public.pro_media_library m
  where m.id = new.media_id;

  if v_media_account_id is null then
    raise exception 'INRCY_MEDIA_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_workspace_account_id <> v_media_account_id then
    raise exception 'INRCY_MEDIA_CROSS_ACCOUNT_LINK_DENIED' using errcode = 'P0001';
  end if;

  if not coalesce(v_media_active, false) or v_upload_status = 'removed' then
    raise exception 'INRCY_MEDIA_INACTIVE' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' then
    select
      count(*)::integer,
      coalesce(bool_or(m.media_type = 'video'), false)
    into v_existing_count, v_has_video
    from public.publication_workspace_media wm
    join public.pro_media_library m on m.id = wm.media_id
    where wm.workspace_id = new.workspace_id
      and not (wm.workspace_id = old.workspace_id and wm.media_id = old.media_id);
  else
    select
      count(*)::integer,
      coalesce(bool_or(m.media_type = 'video'), false)
    into v_existing_count, v_has_video
    from public.publication_workspace_media wm
    join public.pro_media_library m on m.id = wm.media_id
    where wm.workspace_id = new.workspace_id;
  end if;

  if v_media_type = 'video' then
    if new.position <> 0 then
      raise exception 'INRCY_MEDIA_VIDEO_POSITION_MUST_BE_ZERO' using errcode = 'P0001';
    end if;
    if v_existing_count > 0 then
      raise exception 'INRCY_MEDIA_CONTRACT_ONE_VIDEO_OR_FIVE_IMAGES' using errcode = 'P0001';
    end if;
  elsif v_media_type = 'image' then
    if v_has_video or v_existing_count >= 5 then
      raise exception 'INRCY_MEDIA_CONTRACT_ONE_VIDEO_OR_FIVE_IMAGES' using errcode = 'P0001';
    end if;
  else
    raise exception 'INRCY_MEDIA_TYPE_UNSUPPORTED' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.inrcy_validate_publication_workspace_media() from public, anon, authenticated;
grant execute on function public.inrcy_validate_publication_workspace_media() to authenticated, service_role;

create or replace function public.inrcy_validate_media_variant_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_media_account_id uuid;
  v_workspace_account_id uuid;
begin
  select m.user_id
  into v_media_account_id
  from public.pro_media_library m
  where m.id = new.media_id;

  if v_media_account_id is null then
    raise exception 'INRCY_MEDIA_NOT_FOUND' using errcode = 'P0001';
  end if;

  if new.account_id is null then
    new.account_id := v_media_account_id;
  elsif new.account_id <> v_media_account_id then
    raise exception 'INRCY_MEDIA_VARIANT_ACCOUNT_MISMATCH' using errcode = 'P0001';
  end if;

  if new.workspace_id is not null then
    select w.account_id
    into v_workspace_account_id
    from public.publication_workspaces w
    where w.id = new.workspace_id;

    if v_workspace_account_id is null or v_workspace_account_id <> v_media_account_id then
      raise exception 'INRCY_MEDIA_VARIANT_WORKSPACE_MISMATCH' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.inrcy_validate_media_variant_scope() from public, anon, authenticated;
grant execute on function public.inrcy_validate_media_variant_scope() to authenticated, service_role;

create or replace function public.inrcy_validate_media_job_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_media_account_id uuid;
  v_workspace_account_id uuid;
  v_variant_account_id uuid;
  v_variant_media_id uuid;
begin
  select m.user_id
  into v_media_account_id
  from public.pro_media_library m
  where m.id = new.media_id;

  if v_media_account_id is null then
    raise exception 'INRCY_MEDIA_NOT_FOUND' using errcode = 'P0001';
  end if;

  if new.account_id is null then
    new.account_id := v_media_account_id;
  elsif new.account_id <> v_media_account_id then
    raise exception 'INRCY_MEDIA_JOB_ACCOUNT_MISMATCH' using errcode = 'P0001';
  end if;

  if new.workspace_id is not null then
    select w.account_id
    into v_workspace_account_id
    from public.publication_workspaces w
    where w.id = new.workspace_id;

    if v_workspace_account_id is null or v_workspace_account_id <> v_media_account_id then
      raise exception 'INRCY_MEDIA_JOB_WORKSPACE_MISMATCH' using errcode = 'P0001';
    end if;
  end if;

  if new.variant_id is not null then
    select v.account_id, v.media_id
    into v_variant_account_id, v_variant_media_id
    from public.media_variants v
    where v.id = new.variant_id;

    if v_variant_account_id is null
       or v_variant_account_id <> v_media_account_id
       or v_variant_media_id <> new.media_id then
      raise exception 'INRCY_MEDIA_JOB_VARIANT_MISMATCH' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.inrcy_validate_media_job_scope() from public, anon, authenticated;
grant execute on function public.inrcy_validate_media_job_scope() to authenticated, service_role;

-- Garde-fous d'immuabilité du compte métier.
drop trigger if exists pro_media_library_guard_account_scope on public.pro_media_library;
create trigger pro_media_library_guard_account_scope
before update of user_id on public.pro_media_library
for each row execute function public.inrcy_media_guard_account_scope();

drop trigger if exists publication_workspaces_guard_account_scope on public.publication_workspaces;
create trigger publication_workspaces_guard_account_scope
before update of account_id on public.publication_workspaces
for each row execute function public.inrcy_media_guard_account_scope();

-- Triggers updated_at.
drop trigger if exists publication_workspaces_touch_updated_at on public.publication_workspaces;
create trigger publication_workspaces_touch_updated_at
before update on public.publication_workspaces
for each row execute function public.inrcy_media_touch_updated_at();

drop trigger if exists publication_workspace_media_touch_updated_at on public.publication_workspace_media;
create trigger publication_workspace_media_touch_updated_at
before update on public.publication_workspace_media
for each row execute function public.inrcy_media_touch_updated_at();

drop trigger if exists media_variants_touch_updated_at on public.media_variants;
create trigger media_variants_touch_updated_at
before update on public.media_variants
for each row execute function public.inrcy_media_touch_updated_at();

drop trigger if exists media_processing_jobs_touch_updated_at on public.media_processing_jobs;
create trigger media_processing_jobs_touch_updated_at
before update on public.media_processing_jobs
for each row execute function public.inrcy_media_touch_updated_at();

-- Triggers de cohérence.
drop trigger if exists publication_workspace_media_validate on public.publication_workspace_media;
create trigger publication_workspace_media_validate
before insert or update on public.publication_workspace_media
for each row execute function public.inrcy_validate_publication_workspace_media();

drop trigger if exists media_variants_validate_scope on public.media_variants;
create trigger media_variants_validate_scope
before insert or update of account_id, media_id, workspace_id on public.media_variants
for each row execute function public.inrcy_validate_media_variant_scope();

drop trigger if exists media_processing_jobs_validate_scope on public.media_processing_jobs;
create trigger media_processing_jobs_validate_scope
before insert or update of account_id, media_id, workspace_id, variant_id on public.media_processing_jobs
for each row execute function public.inrcy_validate_media_job_scope();

-- ---------------------------------------------------------------------------
-- 7) RLS et privilèges.
-- ---------------------------------------------------------------------------

alter table public.pro_media_library enable row level security;
alter table public.publication_workspaces enable row level security;
alter table public.publication_workspace_media enable row level security;
alter table public.media_variants enable row level security;
alter table public.media_processing_jobs enable row level security;

revoke all on public.pro_media_library from anon;
revoke all on public.publication_workspaces from anon;
revoke all on public.publication_workspace_media from anon;
revoke all on public.media_variants from anon;
revoke all on public.media_processing_jobs from anon;

-- Le registre historique garde ses capacités actuelles, protégées par RLS.
grant select, insert, update, delete on public.pro_media_library to authenticated;
grant select, insert, update, delete on public.publication_workspaces to authenticated;
grant select, insert, update, delete on public.publication_workspace_media to authenticated;

-- Les sorties worker et la file de jobs sont en lecture seule côté client.
grant select on public.media_variants to authenticated;
grant select on public.media_processing_jobs to authenticated;

grant all on public.pro_media_library to service_role;
grant all on public.publication_workspaces to service_role;
grant all on public.publication_workspace_media to service_role;
grant all on public.media_variants to service_role;
grant all on public.media_processing_jobs to service_role;

-- Registre média : policies explicitement adaptées au scope établissement.
drop policy if exists "pro_media_library_select_own" on public.pro_media_library;
create policy "pro_media_library_select_own"
  on public.pro_media_library
  for select
  to authenticated
  using (public.inrcy_can_access_account(user_id));

drop policy if exists "pro_media_library_insert_own" on public.pro_media_library;
create policy "pro_media_library_insert_own"
  on public.pro_media_library
  for insert
  to authenticated
  with check (public.inrcy_can_access_account(user_id));

drop policy if exists "pro_media_library_update_own" on public.pro_media_library;
create policy "pro_media_library_update_own"
  on public.pro_media_library
  for update
  to authenticated
  using (public.inrcy_can_access_account(user_id))
  with check (public.inrcy_can_access_account(user_id));

drop policy if exists "pro_media_library_delete_own" on public.pro_media_library;
create policy "pro_media_library_delete_own"
  on public.pro_media_library
  for delete
  to authenticated
  using (public.inrcy_can_access_account(user_id));

-- Workspaces.
drop policy if exists publication_workspaces_select_accessible on public.publication_workspaces;
create policy publication_workspaces_select_accessible
  on public.publication_workspaces
  for select
  to authenticated
  using (public.inrcy_can_access_account(account_id));

drop policy if exists publication_workspaces_insert_accessible on public.publication_workspaces;
create policy publication_workspaces_insert_accessible
  on public.publication_workspaces
  for insert
  to authenticated
  with check (
    public.inrcy_can_access_account(account_id)
    and (
      created_by_auth_user_id is null
      or created_by_auth_user_id = auth.uid()
    )
  );

drop policy if exists publication_workspaces_update_accessible on public.publication_workspaces;
create policy publication_workspaces_update_accessible
  on public.publication_workspaces
  for update
  to authenticated
  using (public.inrcy_can_access_account(account_id))
  with check (public.inrcy_can_access_account(account_id));

drop policy if exists publication_workspaces_delete_accessible on public.publication_workspaces;
create policy publication_workspaces_delete_accessible
  on public.publication_workspaces
  for delete
  to authenticated
  using (public.inrcy_can_access_account(account_id));

-- Liaisons workspace / média.
drop policy if exists publication_workspace_media_select_accessible on public.publication_workspace_media;
create policy publication_workspace_media_select_accessible
  on public.publication_workspace_media
  for select
  to authenticated
  using (public.inrcy_can_access_publication_workspace(workspace_id));

drop policy if exists publication_workspace_media_insert_accessible on public.publication_workspace_media;
create policy publication_workspace_media_insert_accessible
  on public.publication_workspace_media
  for insert
  to authenticated
  with check (public.inrcy_can_access_publication_workspace(workspace_id));

drop policy if exists publication_workspace_media_update_accessible on public.publication_workspace_media;
create policy publication_workspace_media_update_accessible
  on public.publication_workspace_media
  for update
  to authenticated
  using (public.inrcy_can_access_publication_workspace(workspace_id))
  with check (public.inrcy_can_access_publication_workspace(workspace_id));

drop policy if exists publication_workspace_media_delete_accessible on public.publication_workspace_media;
create policy publication_workspace_media_delete_accessible
  on public.publication_workspace_media
  for delete
  to authenticated
  using (public.inrcy_can_access_publication_workspace(workspace_id));

-- Variantes et jobs : lecture du statut uniquement pour les membres du compte.
drop policy if exists media_variants_select_accessible on public.media_variants;
create policy media_variants_select_accessible
  on public.media_variants
  for select
  to authenticated
  using (public.inrcy_can_access_account(account_id));

drop policy if exists media_processing_jobs_select_accessible on public.media_processing_jobs;
create policy media_processing_jobs_select_accessible
  on public.media_processing_jobs
  for select
  to authenticated
  using (public.inrcy_can_access_account(account_id));

commit;
