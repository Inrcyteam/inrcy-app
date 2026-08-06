-- Verification en lecture seule apres la reparation du registre video v2.

select
  to_regprocedure(
    'public.inrcy_enqueue_video_normalization(uuid,uuid,uuid,integer)'
  ) is not null as enqueue_function_present,
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

-- Le RPC est SECURITY DEFINER : son search_path doit etre fige et sa garde
-- applicative doit continuer a refuser tout role autre que service_role.
-- Les trois resultats attendus sont true.
with function_security as (
  select
    p.prosecdef,
    p.proconfig,
    pg_get_functiondef(p.oid) as definition
  from pg_catalog.pg_proc p
  where p.oid =
    'public.inrcy_enqueue_video_normalization(uuid,uuid,uuid,integer)'::regprocedure
)
select
  prosecdef as security_definer,
  coalesce(
    'search_path=public, pg_temp' = any(proconfig),
    false
  ) as fixed_search_path,
  (
    definition ~* $regex$auth\.role\(\)$regex$
    and definition ~* $regex$<>\s*'service_role'$regex$
    and definition ~* $regex$raise\s+exception\s+'service_role requis'$regex$
  ) as service_role_auth_gate
from function_security;

-- Le RPC normal suit lui aussi l'ordre job -> media. Le chemin de lease active
-- doit retourner son ACK retryable avant toute mutation de variante, job ou
-- media. Les trois resultats attendus sont true.
with function_concurrency as (
  select lower(pg_get_functiondef(
    'public.inrcy_enqueue_video_normalization(uuid,uuid,uuid,integer)'::regprocedure
  )) as definition
)
select
  position('pg_advisory_xact_lock' in definition) > 0
    as concurrent_enqueues_are_serialized,
  (
    position('into v_existing_job' in definition) > 0
    and position('into v_existing_job' in definition)
      < position('into v_media' in definition)
  ) as job_lock_precedes_media_lock,
  (
    position('active_job_unchanged_retry_later' in definition) > 0
    and position('active_job_unchanged_retry_later' in definition)
      < position('insert into public.media_variants' in definition)
    and position('active_job_unchanged_retry_later' in definition)
      < position('update public.media_variants' in definition)
    and position('active_job_unchanged_retry_later' in definition)
      < position('insert into public.media_processing_jobs' in definition)
    and position('active_job_unchanged_retry_later' in definition)
      < position('update public.media_processing_jobs' in definition)
    and position('active_job_unchanged_retry_later' in definition)
      < position('update public.pro_media_library' in definition)
    and substring(
      definition
      from 1
      for position('active_job_unchanged_retry_later' in definition) - 1
    ) !~ $regex$\m(insert|update|delete|merge)\M\s+(into\s+)?public\.$regex$
  ) as active_lease_ack_precedes_all_mutations
from function_concurrency;

-- Les sept appels format(..., p_pipeline_version) doivent etre presents dans
-- pg_get_functiondef. Le resultat attendu est true.
with function_contract as (
  select pg_get_functiondef(
    'public.inrcy_enqueue_video_normalization(uuid,uuid,uuid,integer)'::regprocedure
  ) as definition
)
select not exists (
  select 1
  from function_contract contract
  cross join unnest(array[
    $regex$format\(\s*'inrcy:video:canonical:v%s'\s*,\s*p_pipeline_version\s*\)$regex$,
    $regex$format\(\s*'inrcy:video:ai_preview:v%s'\s*,\s*p_pipeline_version\s*\)$regex$,
    $regex$format\(\s*'inrcy:video:thumbnail:v%s'\s*,\s*p_pipeline_version\s*\)$regex$,
    $regex$format\(\s*'inrcy:video:frame:01:v%s'\s*,\s*p_pipeline_version\s*\)$regex$,
    $regex$format\(\s*'inrcy:video:frame:02:v%s'\s*,\s*p_pipeline_version\s*\)$regex$,
    $regex$format\(\s*'inrcy:video:frame:03:v%s'\s*,\s*p_pipeline_version\s*\)$regex$,
    $regex$format\(\s*'inrcy:video:audio_track:v%s'\s*,\s*p_pipeline_version\s*\)$regex$
  ]) as expected(pattern)
  where contract.definition !~ expected.pattern
) as all_video_signatures_are_dynamic;

-- Resultat attendu : 0. Ce controle couvre variant_id et toutes les references
-- techniques du payload, y compris le tableau des captures.
select count(*) as v2_jobs_still_pointing_to_v1
from public.media_processing_jobs j
where j.job_type = 'video_normalize_v1'
  and j.payload ->> 'pipelineVersion' = '2'
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

-- Resultat attendu : 0. C'est la meme population que la garde de migration :
-- aucun candidat v2 -> v1 ne doit encore appartenir a un worker actif.
select count(*) as v2_active_lease_repair_candidates
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

-- Chaque job v2 doit voir exactement les sept signatures attendues. Cette
-- requete ne retourne que les anomalies.
select
  j.id as job_id,
  j.media_id,
  j.status,
  count(distinct v.signature) as v2_variant_count
from public.media_processing_jobs j
left join public.media_variants v
  on v.account_id = j.account_id
 and v.media_id = j.media_id
 and v.workspace_id is null
 and v.signature in (
   'inrcy:video:canonical:v2',
   'inrcy:video:ai_preview:v2',
   'inrcy:video:thumbnail:v2',
   'inrcy:video:frame:01:v2',
   'inrcy:video:frame:02:v2',
   'inrcy:video:frame:03:v2',
   'inrcy:video:audio_track:v2'
 )
where j.job_type = 'video_normalize_v1'
  and j.payload ->> 'pipelineVersion' = '2'
group by j.id, j.media_id, j.status
having count(distinct v.signature) <> 7
order by min(j.created_at);

-- Resultat attendu : 0. Cette verification inclut les variantes ready : une
-- signature v2 doit toujours porter pipeline_version=2.
select count(*) as v2_variants_with_wrong_pipeline_version
from public.media_variants
where signature in (
  'inrcy:video:canonical:v2',
  'inrcy:video:ai_preview:v2',
  'inrcy:video:thumbnail:v2',
  'inrcy:video:frame:01:v2',
  'inrcy:video:frame:02:v2',
  'inrcy:video:frame:03:v2',
  'inrcy:video:audio_track:v2'
)
  and pipeline_version is distinct from 2;

-- Resultat attendu : aucune ligne. Chaque identifiant technique du job doit
-- designer exactement la variante v2 attendue du meme compte et du meme
-- media. Les trois captures doivent former un tableau de trois IDs ordonnes.
with expected_job_variant_refs as (
  select
    j.id as job_id,
    j.account_id,
    j.media_id,
    ref.output_key,
    ref.variant_id,
    ref.expected_purpose,
    ref.expected_signature,
    case
      when jsonb_typeof(j.payload -> 'frameVariantIds') = 'array'
        then jsonb_array_length(j.payload -> 'frameVariantIds') = 3
      else false
    end as frame_array_is_exact
  from public.media_processing_jobs j
  cross join lateral (
    values
      (
        'job.variant_id'::text,
        j.variant_id::text,
        'canonical'::text,
        'inrcy:video:canonical:v2'::text
      ),
      (
        'payload.canonicalVariantId',
        j.payload ->> 'canonicalVariantId',
        'canonical',
        'inrcy:video:canonical:v2'
      ),
      (
        'payload.aiPreviewVariantId',
        j.payload ->> 'aiPreviewVariantId',
        'ai_preview',
        'inrcy:video:ai_preview:v2'
      ),
      (
        'payload.thumbnailVariantId',
        j.payload ->> 'thumbnailVariantId',
        'thumbnail',
        'inrcy:video:thumbnail:v2'
      ),
      (
        'payload.frameVariantIds[0]',
        j.payload #>> '{frameVariantIds,0}',
        'video_frame',
        'inrcy:video:frame:01:v2'
      ),
      (
        'payload.frameVariantIds[1]',
        j.payload #>> '{frameVariantIds,1}',
        'video_frame',
        'inrcy:video:frame:02:v2'
      ),
      (
        'payload.frameVariantIds[2]',
        j.payload #>> '{frameVariantIds,2}',
        'video_frame',
        'inrcy:video:frame:03:v2'
      ),
      (
        'payload.audioTrackVariantId',
        j.payload ->> 'audioTrackVariantId',
        'audio_track',
        'inrcy:video:audio_track:v2'
      )
  ) as ref(output_key, variant_id, expected_purpose, expected_signature)
  where j.job_type = 'video_normalize_v1'
    and j.payload ->> 'pipelineVersion' = '2'
), v2_payload_reference_inconsistencies as (
  select
    refs.job_id,
    refs.output_key,
    refs.variant_id,
    refs.expected_purpose,
    refs.expected_signature,
    v.account_id as actual_account_id,
    v.media_id as actual_media_id,
    v.workspace_id as actual_workspace_id,
    v.purpose as actual_purpose,
    v.signature as actual_signature,
    v.pipeline_version as actual_pipeline_version
  from expected_job_variant_refs refs
  left join public.media_variants v
    on v.id::text = refs.variant_id
  where refs.variant_id is null
     or v.id is null
     or v.account_id is distinct from refs.account_id
     or v.media_id is distinct from refs.media_id
     or v.workspace_id is not null
     or v.purpose is distinct from refs.expected_purpose
     or v.signature is distinct from refs.expected_signature
     or v.pipeline_version is distinct from 2
     or not refs.frame_array_is_exact
)
select *
from v2_payload_reference_inconsistencies
order by job_id, output_key;

-- La requete ne doit retourner aucune ligne : la cle stable garantit un seul
-- job de normalisation par media et par compte.
select
  account_id,
  media_id,
  idempotency_key,
  count(*) as duplicate_count
from public.media_processing_jobs
where job_type = 'video_normalize_v1'
  and idempotency_key = 'video-normalize:v1:' || media_id::text
group by account_id, media_id, idempotency_key
having count(*) > 1;

-- Echantillon operationnel : mission/requiredOutputs doivent rester visibles
-- pendant que les jobs repares reprennent.
select
  id,
  media_id,
  workspace_id,
  status,
  attempt_count,
  payload ->> 'pipelineMission' as pipeline_mission,
  payload -> 'requiredOutputs' as required_outputs,
  payload ->> 'registryRepairedAt' as registry_repaired_at
from public.media_processing_jobs
where job_type = 'video_normalize_v1'
  and payload ->> 'pipelineVersion' = '2'
order by updated_at desc
limit 50;
