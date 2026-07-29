-- iNrCy — Pipeline média universel — Étape 5
-- Normalisation automatique des images avec file persistante et worker Sharp.
--
-- Migration additive et idempotente :
--   * aucune table ni colonne supprimée ;
--   * réutilise media_variants et media_processing_jobs de l'étape 2 ;
--   * les fonctions sont réservées au service_role ;
--   * aucun ancien parcours Booster n'est supprimé.

begin;

do $$
begin
  if to_regclass('public.pro_media_library') is null
     or to_regclass('public.media_variants') is null
     or to_regclass('public.media_processing_jobs') is null
     or to_regclass('public.publication_workspaces') is null then
    raise exception 'Pré-requis absent : appliquer le registre média universel étape 2 avant l étape 5.';
  end if;
end;
$$;

create or replace function public.inrcy_enqueue_image_normalization(
  p_media_id uuid,
  p_account_id uuid,
  p_workspace_id uuid default null,
  p_pipeline_version integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_media public.pro_media_library%rowtype;
  v_workspace_account uuid;
  v_canonical_id uuid;
  v_ai_preview_id uuid;
  v_thumbnail_id uuid;
  v_job_id uuid;
  v_job_status text;
  v_idempotency_key text;
  v_now timestamptz := now();
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise exception 'service_role requis' using errcode = '42501';
  end if;

  if p_pipeline_version < 1 then
    raise exception 'Version pipeline image invalide.' using errcode = '22023';
  end if;

  select *
    into v_media
  from public.pro_media_library
  where id = p_media_id
    and user_id = p_account_id
  for update;

  if not found then
    raise exception 'Média introuvable pour cet établissement.' using errcode = 'P0002';
  end if;

  if v_media.media_type <> 'image' then
    return jsonb_build_object(
      'ok', true,
      'queued', false,
      'reason', 'not_an_image',
      'mediaId', p_media_id
    );
  end if;

  if v_media.upload_status <> 'uploaded' then
    return jsonb_build_object(
      'ok', true,
      'queued', false,
      'reason', 'source_not_uploaded',
      'mediaId', p_media_id
    );
  end if;

  if p_workspace_id is not null then
    select account_id
      into v_workspace_account
    from public.publication_workspaces
    where id = p_workspace_id;

    if v_workspace_account is null or v_workspace_account <> p_account_id then
      raise exception 'Workspace image incohérent avec le compte.' using errcode = '23514';
    end if;
  end if;

  select id into v_canonical_id
  from public.media_variants
  where media_id = p_media_id
    and workspace_id is null
    and purpose = 'canonical'
    and channel is null
    and signature = 'inrcy:image:canonical:v1'
  limit 1
  for update;

  if v_canonical_id is null then
    insert into public.media_variants (
      account_id,
      media_id,
      workspace_id,
      purpose,
      channel,
      signature,
      status,
      pipeline_version,
      transform_spec,
      variant_metadata
    ) values (
      p_account_id,
      p_media_id,
      null,
      'canonical',
      null,
      'inrcy:image:canonical:v1',
      'pending',
      p_pipeline_version,
      jsonb_build_object('recipe', 'image_normalize_v1', 'crop', false),
      '{}'::jsonb
    )
    returning id into v_canonical_id;
  elsif exists (
    select 1 from public.media_variants
    where id = v_canonical_id and status <> 'ready'
  ) then
    update public.media_variants
    set status = 'pending',
        error_code = null,
        error_message = null,
        pipeline_version = p_pipeline_version,
        updated_at = v_now
    where id = v_canonical_id;
  end if;

  select id into v_ai_preview_id
  from public.media_variants
  where media_id = p_media_id
    and workspace_id is null
    and purpose = 'ai_preview'
    and channel is null
    and signature = 'inrcy:image:ai_preview:v1'
  limit 1
  for update;

  if v_ai_preview_id is null then
    insert into public.media_variants (
      account_id,
      media_id,
      workspace_id,
      purpose,
      channel,
      signature,
      status,
      pipeline_version,
      transform_spec,
      variant_metadata
    ) values (
      p_account_id,
      p_media_id,
      null,
      'ai_preview',
      null,
      'inrcy:image:ai_preview:v1',
      'pending',
      p_pipeline_version,
      jsonb_build_object('recipe', 'image_normalize_v1', 'max_side', 1280, 'crop', false),
      '{}'::jsonb
    )
    returning id into v_ai_preview_id;
  elsif exists (
    select 1 from public.media_variants
    where id = v_ai_preview_id and status <> 'ready'
  ) then
    update public.media_variants
    set status = 'pending',
        error_code = null,
        error_message = null,
        pipeline_version = p_pipeline_version,
        updated_at = v_now
    where id = v_ai_preview_id;
  end if;

  select id into v_thumbnail_id
  from public.media_variants
  where media_id = p_media_id
    and workspace_id is null
    and purpose = 'thumbnail'
    and channel is null
    and signature = 'inrcy:image:thumbnail:v1'
  limit 1
  for update;

  if v_thumbnail_id is null then
    insert into public.media_variants (
      account_id,
      media_id,
      workspace_id,
      purpose,
      channel,
      signature,
      status,
      pipeline_version,
      transform_spec,
      variant_metadata
    ) values (
      p_account_id,
      p_media_id,
      null,
      'thumbnail',
      null,
      'inrcy:image:thumbnail:v1',
      'pending',
      p_pipeline_version,
      jsonb_build_object('recipe', 'image_normalize_v1', 'max_side', 480, 'crop', false),
      '{}'::jsonb
    )
    returning id into v_thumbnail_id;
  elsif exists (
    select 1 from public.media_variants
    where id = v_thumbnail_id and status <> 'ready'
  ) then
    update public.media_variants
    set status = 'pending',
        error_code = null,
        error_message = null,
        pipeline_version = p_pipeline_version,
        updated_at = v_now
    where id = v_thumbnail_id;
  end if;

  if exists (
    select 1
    from public.media_variants
    where id in (v_canonical_id, v_ai_preview_id, v_thumbnail_id)
      and status <> 'ready'
  ) then
    v_idempotency_key := 'image-normalize:v1:' || p_media_id::text;

    select id, status
      into v_job_id, v_job_status
    from public.media_processing_jobs
    where account_id = p_account_id
      and idempotency_key = v_idempotency_key
    limit 1
    for update;

    if v_job_id is null then
      insert into public.media_processing_jobs (
        account_id,
        media_id,
        workspace_id,
        variant_id,
        job_type,
        status,
        priority,
        attempt_count,
        max_attempts,
        progress,
        idempotency_key,
        payload,
        available_at
      ) values (
        p_account_id,
        p_media_id,
        p_workspace_id,
        v_canonical_id,
        'image_normalize_v1',
        'queued',
        150,
        0,
        5,
        0,
        v_idempotency_key,
        jsonb_build_object(
          'pipelineVersion', p_pipeline_version,
          'canonicalVariantId', v_canonical_id,
          'aiPreviewVariantId', v_ai_preview_id,
          'thumbnailVariantId', v_thumbnail_id
        ),
        v_now
      )
      returning id into v_job_id;
    else
      update public.media_processing_jobs
      set workspace_id = coalesce(p_workspace_id, workspace_id),
          variant_id = v_canonical_id,
          -- Un cron de réparation repasse aussi sur les médias
          -- failed_retryable. Il ne doit jamais remettre leur compteur à zéro
          -- ni court-circuiter le backoff déjà calculé par le worker.
          status = case
            when v_job_status in ('queued', 'processing', 'retry_wait') then v_job_status
            else 'queued'
          end,
          progress = case
            when v_job_status in ('queued', 'processing', 'retry_wait') then progress
            else 0
          end,
          attempt_count = case
            when v_job_status in ('queued', 'processing', 'retry_wait') then attempt_count
            else 0
          end,
          available_at = case
            when v_job_status in ('queued', 'processing', 'retry_wait') then available_at
            else v_now
          end,
          locked_at = case when v_job_status = 'processing' then locked_at else null end,
          lock_expires_at = case when v_job_status = 'processing' then lock_expires_at else null end,
          locked_by = case when v_job_status = 'processing' then locked_by else null end,
          error_code = case
            when v_job_status in ('processing', 'retry_wait') then error_code
            else null
          end,
          error_message = case
            when v_job_status in ('processing', 'retry_wait') then error_message
            else null
          end,
          completed_at = case
            when v_job_status in ('queued', 'processing', 'retry_wait') then completed_at
            else null
          end,
          payload = jsonb_build_object(
            'pipelineVersion', p_pipeline_version,
            'canonicalVariantId', v_canonical_id,
            'aiPreviewVariantId', v_ai_preview_id,
            'thumbnailVariantId', v_thumbnail_id
          ),
          updated_at = v_now
      where id = v_job_id;
    end if;

    update public.pro_media_library
    set processing_status = case
          when processing_status = 'processing' then 'processing'
          else 'queued'
        end,
        publication_status = 'processing',
        processing_progress = case
          when processing_status = 'processing' then processing_progress
          else 0
        end,
        processing_error_code = null,
        processing_error_message = null,
        pipeline_version = greatest(pipeline_version, p_pipeline_version),
        updated_at = v_now
    where id = p_media_id
      and user_id = p_account_id;

    return jsonb_build_object(
      'ok', true,
      'queued', true,
      'jobId', v_job_id,
      'mediaId', p_media_id,
      'canonicalVariantId', v_canonical_id,
      'aiPreviewVariantId', v_ai_preview_id,
      'thumbnailVariantId', v_thumbnail_id
    );
  end if;

  update public.pro_media_library
  set processing_status = 'ready',
      publication_status = 'ready',
      processing_progress = 100,
      processing_error_code = null,
      processing_error_message = null,
      processing_completed_at = coalesce(processing_completed_at, v_now),
      pipeline_version = greatest(pipeline_version, p_pipeline_version),
      updated_at = v_now
  where id = p_media_id
    and user_id = p_account_id;

  return jsonb_build_object(
    'ok', true,
    'queued', false,
    'reason', 'variants_already_ready',
    'mediaId', p_media_id,
    'canonicalVariantId', v_canonical_id,
    'aiPreviewVariantId', v_ai_preview_id,
    'thumbnailVariantId', v_thumbnail_id
  );
end;
$$;

create or replace function public.inrcy_claim_image_normalization_jobs(
  p_worker_id text,
  p_limit integer default 2,
  p_lease_seconds integer default 180
)
returns setof public.media_processing_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise exception 'service_role requis' using errcode = '42501';
  end if;

  return query
  with candidates as (
    select j.id
    from public.media_processing_jobs j
    where j.job_type = 'image_normalize_v1'
      and j.attempt_count < j.max_attempts
      and (
        (j.status in ('queued', 'retry_wait') and j.available_at <= now())
        or
        (j.status = 'processing' and j.lock_expires_at is not null and j.lock_expires_at <= now())
      )
    order by j.priority desc, j.available_at asc, j.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 2), 4))
  )
  update public.media_processing_jobs j
  set status = 'processing',
      attempt_count = j.attempt_count + 1,
      progress = greatest(j.progress, 1),
      locked_at = now(),
      lock_expires_at = now() + make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 180), 900))),
      locked_by = left(coalesce(nullif(btrim(p_worker_id), ''), 'image-worker'), 180),
      started_at = coalesce(j.started_at, now()),
      error_code = null,
      error_message = null,
      updated_at = now()
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;

revoke all on function public.inrcy_enqueue_image_normalization(uuid, uuid, uuid, integer) from public;
revoke all on function public.inrcy_enqueue_image_normalization(uuid, uuid, uuid, integer) from anon;
revoke all on function public.inrcy_enqueue_image_normalization(uuid, uuid, uuid, integer) from authenticated;
grant execute on function public.inrcy_enqueue_image_normalization(uuid, uuid, uuid, integer) to service_role;

revoke all on function public.inrcy_claim_image_normalization_jobs(text, integer, integer) from public;
revoke all on function public.inrcy_claim_image_normalization_jobs(text, integer, integer) from anon;
revoke all on function public.inrcy_claim_image_normalization_jobs(text, integer, integer) from authenticated;
grant execute on function public.inrcy_claim_image_normalization_jobs(text, integer, integer) to service_role;

comment on function public.inrcy_enqueue_image_normalization(uuid, uuid, uuid, integer) is
  'Étape 5 : crée idempotemment les variantes image canonique, IA et miniature puis met en file le worker Sharp.';

comment on function public.inrcy_claim_image_normalization_jobs(text, integer, integer) is
  'Étape 5 : claim atomique SKIP LOCKED des jobs image, réservé au service_role.';

commit;
