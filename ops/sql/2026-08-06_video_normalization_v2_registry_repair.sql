-- iNrCy - alignement du registre video avec la version demandee par le worker.
--
-- Migration additive et idempotente :
--   * les signatures des sept variantes suivent p_pipeline_version ;
--   * le type et la cle d'idempotence du worker restent en v1 (contrat de job) ;
--   * un payload existant est fusionne, jamais remplace, afin de conserver la
--     mission et requiredOutputs ;
--   * les jobs pipelineVersion=2 encore relies aux variantes v1 sont repares
--     sur place puis remis en file, sans creer un second job.

begin;

do $$
begin
  if to_regclass('public.pro_media_library') is null
     or to_regclass('public.media_variants') is null
     or to_regclass('public.media_processing_jobs') is null
     or to_regclass('public.publication_workspaces') is null
     or to_regclass('public.publication_workspace_media') is null then
    raise exception 'Prerequis media pipeline absent.';
  end if;
end;
$$;

-- La nouvelle definition du RPC ne devient visible aux autres sessions qu'au
-- COMMIT. Pendant cette courte fenetre, une ancienne session pourrait encore
-- suivre l'ordre media -> job alors que la reparation suit job -> media. Cette
-- barriere transactionnelle interdit toute ecriture concurrente ainsi que le
-- SELECT ... FOR UPDATE initial de l'ancien RPC sur les cinq tables touchees.
-- NOWAIT annule immediatement et proprement la transaction si une session les
-- utilise : il suffit alors de rejouer le script, sans attente circulaire,
-- sans doublon et sans demi-migration.
lock table
  public.media_processing_jobs,
  public.pro_media_library,
  public.media_variants,
  public.publication_workspace_media,
  public.publication_workspaces
in exclusive mode nowait;

-- Un worker qui possede encore une lease valide doit terminer ou liberer son
-- job avant cette migration. Lever l'exception dans la transaction garantit
-- qu'aucun remplacement de fonction ni changement de registre n'est conserve.
do $video_v2_active_lease_guard$
declare
  v_active_job_ids uuid[];
begin
  select array_agg(j.id order by j.id)
    into v_active_job_ids
  from public.media_processing_jobs j
  where j.job_type = 'video_normalize_v1'
    and j.payload ->> 'pipelineVersion' = '2'
    and j.status = 'processing'
    and (
      (
        j.lock_expires_at is not null
        and j.lock_expires_at > now()
      )
      or (
        j.lock_expires_at is null
        and coalesce(j.locked_at, j.updated_at, j.created_at)
          > now() - interval '15 minutes'
      )
    )
    and exists (
      select 1
      from public.media_variants legacy
      where legacy.account_id = j.account_id
        and legacy.media_id = j.media_id
        and legacy.workspace_id is null
        and legacy.signature in (
          'inrcy:video:canonical:v1',
          'inrcy:video:ai_preview:v1',
          'inrcy:video:thumbnail:v1',
          'inrcy:video:frame:01:v1',
          'inrcy:video:frame:02:v1',
          'inrcy:video:frame:03:v1',
          'inrcy:video:audio_track:v1'
        )
        and (
          legacy.id = j.variant_id
          or legacy.id::text = j.payload ->> 'canonicalVariantId'
          or legacy.id::text = j.payload ->> 'aiPreviewVariantId'
          or legacy.id::text = j.payload ->> 'thumbnailVariantId'
          or legacy.id::text = j.payload ->> 'audioTrackVariantId'
          or coalesce(
            j.payload -> 'frameVariantIds', '[]'::jsonb
          ) ? legacy.id::text
        )
    );

  if coalesce(cardinality(v_active_job_ids), 0) > 0 then
    raise exception
      'VIDEO_V2_REGISTRY_REPAIR_ACTIVE_LEASE: un worker video actif doit terminer avant la migration.'
      using
        errcode = '55006',
        detail = 'Jobs actifs: ' || array_to_string(v_active_job_ids, ', '),
        hint = 'Attendre la fin ou l expiration de la lease, puis rejouer la migration.';
  end if;
end;
$video_v2_active_lease_guard$;

create or replace function public.inrcy_enqueue_video_normalization(
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
  v_existing_job public.media_processing_jobs%rowtype;
  v_workspace_account uuid;
  v_canonical_signature text;
  v_ai_preview_signature text;
  v_thumbnail_signature text;
  v_frame_01_signature text;
  v_frame_02_signature text;
  v_frame_03_signature text;
  v_audio_track_signature text;
  v_canonical_id uuid;
  v_ai_preview_id uuid;
  v_thumbnail_id uuid;
  v_frame_01_id uuid;
  v_frame_02_id uuid;
  v_frame_03_id uuid;
  v_audio_track_id uuid;
  v_job_id uuid;
  v_job_status text;
  v_idempotency_key text;
  v_persisted_mission text;
  v_persisted_required_outputs jsonb;
  v_now timestamptz := now();
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise exception 'service_role requis' using errcode = '42501';
  end if;

  if p_pipeline_version is null or p_pipeline_version < 1 then
    raise exception 'Version pipeline video invalide.' using errcode = '22023';
  end if;

  -- La version du registre est celle transmise par le serveur. Le suffixe ne
  -- doit jamais etre fige sur la version du job video_normalize_v1.
  v_canonical_signature := format(
    'inrcy:video:canonical:v%s', p_pipeline_version
  );
  v_ai_preview_signature := format(
    'inrcy:video:ai_preview:v%s', p_pipeline_version
  );
  v_thumbnail_signature := format(
    'inrcy:video:thumbnail:v%s', p_pipeline_version
  );
  v_frame_01_signature := format(
    'inrcy:video:frame:01:v%s', p_pipeline_version
  );
  v_frame_02_signature := format(
    'inrcy:video:frame:02:v%s', p_pipeline_version
  );
  v_frame_03_signature := format(
    'inrcy:video:frame:03:v%s', p_pipeline_version
  );
  v_audio_track_signature := format(
    'inrcy:video:audio_track:v%s', p_pipeline_version
  );

  -- Serialiser les enqueues d'un meme media avant d'observer le job. Sans ce
  -- verrou logique, deux premiers appels pourraient tous deux constater
  -- l'absence du job puis retomber sur un ordre media -> job.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'inrcy:video-normalize:' || p_account_id::text || ':' || p_media_id::text,
    0
  ));

  -- Ordre global partage avec lease_recovery : job, puis media. Quand le job
  -- n'existe pas encore, l'advisory lock ci-dessus garantit qu'aucun autre
  -- enqueue ne peut le creer entre cette lecture et l'insertion plus bas.
  v_idempotency_key := 'video-normalize:v1:' || p_media_id::text;
  select *
    into v_existing_job
  from public.media_processing_jobs
  where account_id = p_account_id
    and idempotency_key = v_idempotency_key
  limit 1
  for update;

  if found then
    v_job_id := v_existing_job.id;
    v_job_status := v_existing_job.status;
  else
    v_job_id := null;
    v_job_status := null;
  end if;

  select *
    into v_media
  from public.pro_media_library
  where id = p_media_id
    and user_id = p_account_id
  for update;

  if not found then
    raise exception 'Media introuvable pour cet etablissement.' using errcode = 'P0002';
  end if;

  if v_media.media_type <> 'video' then
    return jsonb_build_object(
      'ok', true,
      'queued', false,
      'reason', 'not_a_video',
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
      raise exception 'Workspace video incoherent avec le compte.' using errcode = '23514';
    end if;
  end if;

  -- Un worker avec une lease encore valide a pu charger ses anciens IDs avant
  -- cet appel. Accuser reception sans toucher au registre ni au job evite un
  -- melange v1/v2. Le resultat est explicitement retryable : apres la fin ou
  -- l'expiration de la lease, le meme appel reutilisera ce job et fera
  -- l'upgrade en place, sous la meme cle d'idempotence.
  if v_job_id is not null
     and v_job_status = 'processing'
     and (
       (
         v_existing_job.lock_expires_at is not null
         and v_existing_job.lock_expires_at > v_now
       )
       or (
         v_existing_job.lock_expires_at is null
         and coalesce(
           v_existing_job.locked_at,
           v_existing_job.updated_at,
           v_existing_job.created_at
         ) > v_now - interval '15 minutes'
       )
     ) then
    return jsonb_strip_nulls(jsonb_build_object(
      'ok', true,
      'queued', true,
      'retryable', true,
      'reason', 'active_job_unchanged_retry_later',
      'registryUpgradeDeferred', true,
      'jobId', v_existing_job.id,
      'mediaId', p_media_id,
      'requestedPipelineVersion', p_pipeline_version,
      'currentPipelineVersion', v_existing_job.payload -> 'pipelineVersion',
      'leaseExpiresAt', v_existing_job.lock_expires_at,
      'canonicalVariantId', coalesce(
        v_existing_job.payload -> 'canonicalVariantId',
        to_jsonb(v_existing_job.variant_id)
      ),
      'aiPreviewVariantId',
        v_existing_job.payload -> 'aiPreviewVariantId',
      'thumbnailVariantId',
        v_existing_job.payload -> 'thumbnailVariantId',
      'frameVariantIds', v_existing_job.payload -> 'frameVariantIds',
      'audioTrackVariantId',
        v_existing_job.payload -> 'audioTrackVariantId'
    ));
  end if;

  -- La demande est d'abord journalisee sur le media par le serveur. Elle sert
  -- de filet de securite si un ancien RPC avait deja efface la partie mission
  -- du payload avant cette migration.
  v_persisted_mission := case
    when v_media.media_metadata ->> 'pipeline_mission' in (
      'ai_preparation',
      'publication_preparation'
    ) then v_media.media_metadata ->> 'pipeline_mission'
    else null
  end;
  v_persisted_required_outputs := case
    when jsonb_typeof(
      v_media.media_metadata -> 'preparation_required_outputs'
    ) = 'array'
      then v_media.media_metadata -> 'preparation_required_outputs'
    else null
  end;

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
  )
  select
    p_account_id,
    p_media_id,
    null,
    spec.purpose,
    null,
    spec.signature,
    'pending',
    p_pipeline_version,
    spec.transform_spec,
    '{}'::jsonb
  from (
    values
      (
        'canonical'::text,
        v_canonical_signature,
        jsonb_build_object(
          'recipe', format('video_normalize_v%s', p_pipeline_version),
          'crop', false,
          'max_side', 1920
        )
      ),
      (
        'ai_preview'::text,
        v_ai_preview_signature,
        jsonb_build_object(
          'recipe', format('video_ai_preview_v%s', p_pipeline_version),
          'crop', false,
          'max_side', 1280,
          'fps', 15
        )
      ),
      (
        'thumbnail'::text,
        v_thumbnail_signature,
        jsonb_build_object(
          'recipe', format('video_thumbnail_v%s', p_pipeline_version),
          'crop', false,
          'max_side', 720
        )
      ),
      (
        'video_frame'::text,
        v_frame_01_signature,
        jsonb_build_object(
          'recipe', format('video_frame_v%s', p_pipeline_version),
          'frame_index', 1,
          'max_side', 1280
        )
      ),
      (
        'video_frame'::text,
        v_frame_02_signature,
        jsonb_build_object(
          'recipe', format('video_frame_v%s', p_pipeline_version),
          'frame_index', 2,
          'max_side', 1280
        )
      ),
      (
        'video_frame'::text,
        v_frame_03_signature,
        jsonb_build_object(
          'recipe', format('video_frame_v%s', p_pipeline_version),
          'frame_index', 3,
          'max_side', 1280
        )
      ),
      (
        'audio_track'::text,
        v_audio_track_signature,
        jsonb_build_object(
          'recipe', format('video_audio_track_v%s', p_pipeline_version),
          'sample_rate_hz', 16000,
          'channels', 1
        )
      )
  ) as spec(purpose, signature, transform_spec)
  on conflict do nothing;

  -- Corriger aussi une ligne ready mal etiquetee sans la rebasculer pending.
  update public.media_variants
  set pipeline_version = p_pipeline_version,
      updated_at = v_now
  where account_id = p_account_id
    and media_id = p_media_id
    and workspace_id is null
    and signature = any(array[
      v_canonical_signature,
      v_ai_preview_signature,
      v_thumbnail_signature,
      v_frame_01_signature,
      v_frame_02_signature,
      v_frame_03_signature,
      v_audio_track_signature
    ])
    and pipeline_version is distinct from p_pipeline_version;

  update public.media_variants
  set status = 'pending',
      error_code = null,
      error_message = null,
      pipeline_version = p_pipeline_version,
      updated_at = v_now
  where account_id = p_account_id
    and media_id = p_media_id
    and workspace_id is null
    and signature = any(array[
      v_canonical_signature,
      v_ai_preview_signature,
      v_thumbnail_signature,
      v_frame_01_signature,
      v_frame_02_signature,
      v_frame_03_signature,
      v_audio_track_signature
    ])
    and status <> 'ready';

  select id into v_canonical_id
  from public.media_variants
  where account_id = p_account_id
    and media_id = p_media_id
    and workspace_id is null
    and signature = v_canonical_signature
  limit 1 for update;

  select id into v_ai_preview_id
  from public.media_variants
  where account_id = p_account_id
    and media_id = p_media_id
    and workspace_id is null
    and signature = v_ai_preview_signature
  limit 1 for update;

  select id into v_thumbnail_id
  from public.media_variants
  where account_id = p_account_id
    and media_id = p_media_id
    and workspace_id is null
    and signature = v_thumbnail_signature
  limit 1 for update;

  select id into v_frame_01_id
  from public.media_variants
  where account_id = p_account_id
    and media_id = p_media_id
    and workspace_id is null
    and signature = v_frame_01_signature
  limit 1 for update;

  select id into v_frame_02_id
  from public.media_variants
  where account_id = p_account_id
    and media_id = p_media_id
    and workspace_id is null
    and signature = v_frame_02_signature
  limit 1 for update;

  select id into v_frame_03_id
  from public.media_variants
  where account_id = p_account_id
    and media_id = p_media_id
    and workspace_id is null
    and signature = v_frame_03_signature
  limit 1 for update;

  select id into v_audio_track_id
  from public.media_variants
  where account_id = p_account_id
    and media_id = p_media_id
    and workspace_id is null
    and signature = v_audio_track_signature
  limit 1 for update;

  if v_canonical_id is null
     or v_ai_preview_id is null
     or v_thumbnail_id is null
     or v_frame_01_id is null
     or v_frame_02_id is null
     or v_frame_03_id is null
     or v_audio_track_id is null then
    raise exception 'Creation incomplete des variantes video.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.media_variants
    where id in (
      v_canonical_id,
      v_ai_preview_id,
      v_thumbnail_id,
      v_frame_01_id,
      v_frame_02_id,
      v_frame_03_id,
      v_audio_track_id
    )
      and status <> 'ready'
  ) then
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
        'video_normalize_v1',
        'queued',
        140,
        0,
        5,
        0,
        v_idempotency_key,
        jsonb_strip_nulls(jsonb_build_object(
          'pipelineMission', v_persisted_mission,
          'requiredOutputs', v_persisted_required_outputs
        )) || jsonb_build_object(
          'pipelineVersion', p_pipeline_version,
          'canonicalVariantId', v_canonical_id,
          'aiPreviewVariantId', v_ai_preview_id,
          'thumbnailVariantId', v_thumbnail_id,
          'frameVariantIds', jsonb_build_array(
            v_frame_01_id, v_frame_02_id, v_frame_03_id
          ),
          'audioTrackVariantId', v_audio_track_id
        ),
        v_now
      )
      returning id into v_job_id;
    else
      update public.media_processing_jobs
      set workspace_id = coalesce(p_workspace_id, workspace_id),
          variant_id = v_canonical_id,
          job_type = 'video_normalize_v1',
          status = case
            when v_job_status = 'processing' then 'retry_wait'
            when v_job_status in ('queued', 'retry_wait') then v_job_status
            else 'queued'
          end,
          progress = case
            when v_job_status in ('queued', 'retry_wait') then progress
            else 0
          end,
          attempt_count = case
            when v_job_status = 'processing' then 0
            when v_job_status in ('queued', 'retry_wait') then attempt_count
            else 0
          end,
          available_at = case
            when v_job_status in ('queued', 'retry_wait') then available_at
            else v_now
          end,
          -- Un status processing arrive ici uniquement avec une lease expiree.
          -- Il redevient reclamable sans perdre son compteur de tentatives.
          locked_at = null,
          lock_expires_at = null,
          locked_by = null,
          error_code = case
            when v_job_status = 'processing'
              then 'processing_lease_expired_registry_upgrade'
            when v_job_status = 'retry_wait' then error_code
            else null
          end,
          error_message = case
            when v_job_status = 'processing'
              then 'La lease a expire ; le registre video sera mis a niveau a la prochaine reprise.'
            when v_job_status = 'retry_wait' then error_message
            else null
          end,
          completed_at = case
            when v_job_status in ('queued', 'retry_wait') then completed_at
            else null
          end,
          -- Les deux CASE reinjectent seulement une demande absente du job.
          -- Une mission deja fusionnee dans le payload reste donc prioritaire.
          payload = coalesce(payload, '{}'::jsonb)
            || case
              when (coalesce(payload, '{}'::jsonb) ? 'pipelineMission')
                   or v_persisted_mission is null
                then '{}'::jsonb
              else jsonb_build_object('pipelineMission', v_persisted_mission)
            end
            || case
              when (coalesce(payload, '{}'::jsonb) ? 'requiredOutputs')
                   or v_persisted_required_outputs is null
                then '{}'::jsonb
              else jsonb_build_object(
                'requiredOutputs', v_persisted_required_outputs
              )
            end
            || jsonb_build_object(
              'pipelineVersion', p_pipeline_version,
              'canonicalVariantId', v_canonical_id,
              'aiPreviewVariantId', v_ai_preview_id,
              'thumbnailVariantId', v_thumbnail_id,
              'frameVariantIds', jsonb_build_array(
                v_frame_01_id, v_frame_02_id, v_frame_03_id
              ),
              'audioTrackVariantId', v_audio_track_id
            ),
          updated_at = v_now
      where id = v_job_id;
    end if;

    update public.pro_media_library
    set processing_status = case
          -- Le job processing arrive ici uniquement avec une lease expiree :
          -- aucun worker ne travaille encore ce media, il redevient queued.
          when v_job_status = 'processing' then 'queued'
          when processing_status = 'processing' then 'processing'
          else 'queued'
        end,
        publication_status = 'processing',
        processing_progress = case
          when v_job_status = 'processing' then 0
          when processing_status = 'processing' then processing_progress
          else 0
        end,
        processing_error_code = null,
        processing_error_message = null,
        processing_completed_at = null,
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
      'thumbnailVariantId', v_thumbnail_id,
      'frameVariantIds', jsonb_build_array(
        v_frame_01_id, v_frame_02_id, v_frame_03_id
      ),
      'audioTrackVariantId', v_audio_track_id
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
    'thumbnailVariantId', v_thumbnail_id,
    'frameVariantIds', jsonb_build_array(
      v_frame_01_id, v_frame_02_id, v_frame_03_id
    ),
    'audioTrackVariantId', v_audio_track_id
  );
end;
$$;

revoke all on function public.inrcy_enqueue_video_normalization(
  uuid, uuid, uuid, integer
) from public, anon, authenticated;
grant execute on function public.inrcy_enqueue_video_normalization(
  uuid, uuid, uuid, integer
) to service_role;

comment on function public.inrcy_enqueue_video_normalization(
  uuid, uuid, uuid, integer
) is
  'Cree les variantes video de la version demandee, fusionne la mission et reutilise un job idempotent unique.';

-- Reparation one-shot, elle-meme idempotente. Le deuxieme passage ne retrouve
-- plus ces jobs : variant_id et toutes les references du payload pointent v2.
do $video_v2_repair$
declare
  v_candidate_id uuid;
  v_job public.media_processing_jobs%rowtype;
  v_media public.pro_media_library%rowtype;
  v_canonical_id uuid;
  v_ai_preview_id uuid;
  v_thumbnail_id uuid;
  v_frame_01_id uuid;
  v_frame_02_id uuid;
  v_frame_03_id uuid;
  v_audio_track_id uuid;
  v_persisted_mission text;
  v_persisted_required_outputs jsonb;
  v_now timestamptz;
begin
  for v_candidate_id in
    select j.id
    from public.media_processing_jobs j
    join public.pro_media_library m
      on m.id = j.media_id
     and m.user_id = j.account_id
    where j.job_type = 'video_normalize_v1'
      and j.payload ->> 'pipelineVersion' = '2'
      and m.media_type = 'video'
      and m.upload_status = 'uploaded'
      and exists (
        select 1
        from public.media_variants legacy
        where legacy.account_id = j.account_id
          and legacy.media_id = j.media_id
          and legacy.workspace_id is null
          and legacy.signature in (
            'inrcy:video:canonical:v1',
            'inrcy:video:ai_preview:v1',
            'inrcy:video:thumbnail:v1',
            'inrcy:video:frame:01:v1',
            'inrcy:video:frame:02:v1',
            'inrcy:video:frame:03:v1',
            'inrcy:video:audio_track:v1'
          )
          and (
            legacy.id = j.variant_id
            or legacy.id::text = j.payload ->> 'canonicalVariantId'
            or legacy.id::text = j.payload ->> 'aiPreviewVariantId'
            or legacy.id::text = j.payload ->> 'thumbnailVariantId'
            or legacy.id::text = j.payload ->> 'audioTrackVariantId'
            or coalesce(
              j.payload -> 'frameVariantIds', '[]'::jsonb
            ) ? legacy.id::text
          )
      )
    order by j.created_at, j.id
  loop
    -- Meme ordre de verrouillage que lease_recovery : job, puis media.
    -- Le job est reverifie sous verrou avant toute mutation du registre.
    select *
      into v_job
    from public.media_processing_jobs
    where id = v_candidate_id
      and job_type = 'video_normalize_v1'
      and payload ->> 'pipelineVersion' = '2'
    for update;

    if not found then
      continue;
    end if;

    if not exists (
      select 1
      from public.media_variants legacy
      where legacy.account_id = v_job.account_id
        and legacy.media_id = v_job.media_id
        and legacy.workspace_id is null
        and legacy.signature in (
          'inrcy:video:canonical:v1',
          'inrcy:video:ai_preview:v1',
          'inrcy:video:thumbnail:v1',
          'inrcy:video:frame:01:v1',
          'inrcy:video:frame:02:v1',
          'inrcy:video:frame:03:v1',
          'inrcy:video:audio_track:v1'
        )
        and (
          legacy.id = v_job.variant_id
          or legacy.id::text = v_job.payload ->> 'canonicalVariantId'
          or legacy.id::text = v_job.payload ->> 'aiPreviewVariantId'
          or legacy.id::text = v_job.payload ->> 'thumbnailVariantId'
          or legacy.id::text = v_job.payload ->> 'audioTrackVariantId'
          or coalesce(
            v_job.payload -> 'frameVariantIds', '[]'::jsonb
          ) ? legacy.id::text
        )
    ) then
      continue;
    end if;

    -- La garde transactionnelle initiale couvre l'etat au demarrage. Cette
    -- seconde garde sous verrou ferme la course avec une prise de lease qui
    -- aurait lieu pendant la migration : un worker actif n'est jamais remis
    -- en file par la reparation.
    if v_job.status = 'processing'
       and (
         (
           v_job.lock_expires_at is not null
           and v_job.lock_expires_at > now()
         )
         or (
           v_job.lock_expires_at is null
           and coalesce(v_job.locked_at, v_job.updated_at, v_job.created_at)
             > now() - interval '15 minutes'
         )
       ) then
      raise exception
        'VIDEO_V2_REGISTRY_REPAIR_ACTIVE_LEASE: un worker video actif doit terminer avant la migration.'
        using
          errcode = '55006',
          detail = 'Job actif: ' || v_job.id::text,
          hint = 'Attendre la fin ou l expiration de la lease, puis rejouer la migration.';
    end if;

    select *
      into v_media
    from public.pro_media_library
    where id = v_job.media_id
      and user_id = v_job.account_id
      and media_type = 'video'
      and upload_status = 'uploaded'
    for update;

    if not found then
      continue;
    end if;

    v_now := now();
    v_persisted_mission := case
      when v_media.media_metadata ->> 'pipeline_mission' in (
        'ai_preparation',
        'publication_preparation'
      ) then v_media.media_metadata ->> 'pipeline_mission'
      else null
    end;
    v_persisted_required_outputs := case
      when jsonb_typeof(
        v_media.media_metadata -> 'preparation_required_outputs'
      ) = 'array'
        then v_media.media_metadata -> 'preparation_required_outputs'
      else null
    end;

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
    )
    select
      v_job.account_id,
      v_job.media_id,
      null,
      spec.purpose,
      null,
      spec.signature,
      'pending',
      2,
      spec.transform_spec,
      '{}'::jsonb
    from (
      values
        (
          'canonical'::text,
          'inrcy:video:canonical:v2'::text,
          jsonb_build_object(
            'recipe', 'video_normalize_v2', 'crop', false, 'max_side', 1920
          )
        ),
        (
          'ai_preview'::text,
          'inrcy:video:ai_preview:v2'::text,
          jsonb_build_object(
            'recipe', 'video_ai_preview_v2',
            'crop', false,
            'max_side', 1280,
            'fps', 15
          )
        ),
        (
          'thumbnail'::text,
          'inrcy:video:thumbnail:v2'::text,
          jsonb_build_object(
            'recipe', 'video_thumbnail_v2', 'crop', false, 'max_side', 720
          )
        ),
        (
          'video_frame'::text,
          'inrcy:video:frame:01:v2'::text,
          jsonb_build_object(
            'recipe', 'video_frame_v2', 'frame_index', 1, 'max_side', 1280
          )
        ),
        (
          'video_frame'::text,
          'inrcy:video:frame:02:v2'::text,
          jsonb_build_object(
            'recipe', 'video_frame_v2', 'frame_index', 2, 'max_side', 1280
          )
        ),
        (
          'video_frame'::text,
          'inrcy:video:frame:03:v2'::text,
          jsonb_build_object(
            'recipe', 'video_frame_v2', 'frame_index', 3, 'max_side', 1280
          )
        ),
        (
          'audio_track'::text,
          'inrcy:video:audio_track:v2'::text,
          jsonb_build_object(
            'recipe', 'video_audio_track_v2',
            'sample_rate_hz', 16000,
            'channels', 1
          )
        )
    ) as spec(purpose, signature, transform_spec)
    on conflict do nothing;

    -- Une variante v2 deja ready reste ready ; seule son etiquette de
    -- pipeline est corrigee si une ancienne ecriture l'avait laissee en v1.
    update public.media_variants
    set pipeline_version = 2,
        updated_at = v_now
    where account_id = v_job.account_id
      and media_id = v_job.media_id
      and workspace_id is null
      and signature in (
        'inrcy:video:canonical:v2',
        'inrcy:video:ai_preview:v2',
        'inrcy:video:thumbnail:v2',
        'inrcy:video:frame:01:v2',
        'inrcy:video:frame:02:v2',
        'inrcy:video:frame:03:v2',
        'inrcy:video:audio_track:v2'
      )
      and pipeline_version is distinct from 2;

    update public.media_variants
    set status = 'pending',
        error_code = null,
        error_message = null,
        pipeline_version = 2,
        updated_at = v_now
    where account_id = v_job.account_id
      and media_id = v_job.media_id
      and workspace_id is null
      and signature in (
        'inrcy:video:canonical:v2',
        'inrcy:video:ai_preview:v2',
        'inrcy:video:thumbnail:v2',
        'inrcy:video:frame:01:v2',
        'inrcy:video:frame:02:v2',
        'inrcy:video:frame:03:v2',
        'inrcy:video:audio_track:v2'
      )
      and status <> 'ready';

    select id into v_canonical_id
    from public.media_variants
    where account_id = v_job.account_id
      and media_id = v_job.media_id
      and workspace_id is null
      and signature = 'inrcy:video:canonical:v2'
    limit 1 for update;

    select id into v_ai_preview_id
    from public.media_variants
    where account_id = v_job.account_id
      and media_id = v_job.media_id
      and workspace_id is null
      and signature = 'inrcy:video:ai_preview:v2'
    limit 1 for update;

    select id into v_thumbnail_id
    from public.media_variants
    where account_id = v_job.account_id
      and media_id = v_job.media_id
      and workspace_id is null
      and signature = 'inrcy:video:thumbnail:v2'
    limit 1 for update;

    select id into v_frame_01_id
    from public.media_variants
    where account_id = v_job.account_id
      and media_id = v_job.media_id
      and workspace_id is null
      and signature = 'inrcy:video:frame:01:v2'
    limit 1 for update;

    select id into v_frame_02_id
    from public.media_variants
    where account_id = v_job.account_id
      and media_id = v_job.media_id
      and workspace_id is null
      and signature = 'inrcy:video:frame:02:v2'
    limit 1 for update;

    select id into v_frame_03_id
    from public.media_variants
    where account_id = v_job.account_id
      and media_id = v_job.media_id
      and workspace_id is null
      and signature = 'inrcy:video:frame:03:v2'
    limit 1 for update;

    select id into v_audio_track_id
    from public.media_variants
    where account_id = v_job.account_id
      and media_id = v_job.media_id
      and workspace_id is null
      and signature = 'inrcy:video:audio_track:v2'
    limit 1 for update;

    if v_canonical_id is null
       or v_ai_preview_id is null
       or v_thumbnail_id is null
       or v_frame_01_id is null
       or v_frame_02_id is null
       or v_frame_03_id is null
       or v_audio_track_id is null then
      raise exception 'Reparation incomplete des variantes video v2.';
    end if;

    -- Les anciennes lignes avaient recu pipeline_version=2 bien que leur
    -- signature reste v1. Retablir cette coherence sans supprimer l'historique.
    update public.media_variants
    set pipeline_version = 1,
        updated_at = v_now
    where account_id = v_job.account_id
      and media_id = v_job.media_id
      and workspace_id is null
      and signature in (
        'inrcy:video:canonical:v1',
        'inrcy:video:ai_preview:v1',
        'inrcy:video:thumbnail:v1',
        'inrcy:video:frame:01:v1',
        'inrcy:video:frame:02:v1',
        'inrcy:video:frame:03:v1',
        'inrcy:video:audio_track:v1'
      )
      and pipeline_version <> 1;

    update public.media_processing_jobs
    set variant_id = v_canonical_id,
        status = 'queued',
        progress = 0,
        attempt_count = 0,
        available_at = v_now,
        locked_at = null,
        lock_expires_at = null,
        locked_by = null,
        error_code = null,
        error_message = null,
        started_at = null,
        completed_at = null,
        payload = coalesce(v_job.payload, '{}'::jsonb)
          || case
            when (coalesce(v_job.payload, '{}'::jsonb) ? 'pipelineMission')
                 or v_persisted_mission is null
              then '{}'::jsonb
            else jsonb_build_object('pipelineMission', v_persisted_mission)
          end
          || case
            when (coalesce(v_job.payload, '{}'::jsonb) ? 'requiredOutputs')
                 or v_persisted_required_outputs is null
              then '{}'::jsonb
            else jsonb_build_object(
              'requiredOutputs', v_persisted_required_outputs
            )
          end
          || jsonb_build_object(
            'pipelineVersion', 2,
            'canonicalVariantId', v_canonical_id,
            'aiPreviewVariantId', v_ai_preview_id,
            'thumbnailVariantId', v_thumbnail_id,
            'frameVariantIds', jsonb_build_array(
              v_frame_01_id, v_frame_02_id, v_frame_03_id
            ),
            'audioTrackVariantId', v_audio_track_id,
            'registryRepairedAt', v_now
          ),
        result = coalesce(result, '{}'::jsonb) || jsonb_build_object(
          'registryRepair', 'video_v2_signatures'
        ),
        updated_at = v_now
    where id = v_job.id;

    update public.pro_media_library
    set processing_status = 'queued',
        publication_status = 'processing',
        processing_progress = 0,
        processing_error_code = null,
        processing_error_message = null,
        processing_completed_at = null,
        pipeline_version = greatest(pipeline_version, 2),
        updated_at = v_now
    where id = v_job.media_id
      and user_id = v_job.account_id;

    -- Un workspace passe en failed quand les tentatives video sont epuisees.
    -- Le remettre en attente permet au clic deja persiste de reprendre apres le
    -- succes du meme job, sans demander une nouvelle publication au client.
    update public.publication_workspaces w
    set status = 'waiting_media',
        updated_at = v_now
    where w.account_id = v_job.account_id
      and w.status in ('draft', 'active', 'waiting_media', 'ready', 'failed')
      and (
        w.id = v_job.workspace_id
        or exists (
          select 1
          from public.publication_workspace_media wm
          where wm.workspace_id = w.id
            and wm.media_id = v_job.media_id
        )
      )
      and w.status <> 'waiting_media';
  end loop;
end;
$video_v2_repair$;

commit;
