-- iNrCy - reprise durable des jobs media dont la lease a expire.
-- Migration additive et idempotente. Aucun media source n'est supprime.

begin;

do $$
begin
  if to_regclass('public.media_processing_jobs') is null
     or to_regclass('public.pro_media_library') is null
     or to_regclass('public.media_variants') is null
     or to_regclass('public.publication_workspaces') is null
     or to_regclass('public.publication_workspace_media') is null then
    raise exception 'Prerequis media pipeline absent.';
  end if;
end;
$$;

create index if not exists media_processing_jobs_expired_lease_idx
  on public.media_processing_jobs (job_type, lock_expires_at, updated_at, id)
  where status = 'processing';

create or replace function public.inrcy_repair_expired_media_processing_jobs(
  p_job_type text default 'video_normalize_v1',
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_reconciled integer := 0;
  v_recovered integer := 0;
  v_terminalized integer := 0;
  v_recovered_media_ids uuid[] := '{}'::uuid[];
  v_terminal_media_ids uuid[] := '{}'::uuid[];
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise exception 'service_role requis' using errcode = '42501';
  end if;

  if coalesce(nullif(btrim(p_job_type), ''), '') not in (
    'image_normalize_v1',
    'video_normalize_v1'
  ) then
    raise exception 'Type de job media invalide.' using errcode = '22023';
  end if;

  -- Si le worker a fini les ecritures media mais pas son dernier UPDATE job,
  -- reconcilier vers succeeded au lieu de rejouer une transformation terminee.
  with candidates as (
    select j.id
    from public.media_processing_jobs j
    join public.pro_media_library m
      on m.id = j.media_id and m.user_id = j.account_id
    where j.job_type = p_job_type
      and j.status = 'processing'
      and m.processing_status = 'ready'
      and (
        m.publication_status = 'ready'
        or coalesce(
          nullif(btrim(j.payload ->> 'pipelineMission'), ''),
          nullif(btrim(m.media_metadata ->> 'pipeline_mission'), ''),
          ''
        ) = 'ai_preparation'
      )
      and (
        j.lock_expires_at <= v_now
        or (
          j.lock_expires_at is null
          and coalesce(j.locked_at, j.updated_at, j.created_at)
            <= v_now - interval '15 minutes'
        )
      )
    order by coalesce(j.lock_expires_at, j.updated_at), j.id
    for update of j skip locked
    limit v_limit
  ), reconciled as (
    update public.media_processing_jobs j
    set status = 'succeeded',
        progress = 100,
        result = coalesce(j.result, '{}'::jsonb) || jsonb_build_object(
          'leaseRecovery', 'media_already_ready',
          'reconciledAt', v_now
        ),
        error_code = null,
        error_message = null,
        completed_at = coalesce(j.completed_at, v_now),
        locked_at = null,
        lock_expires_at = null,
        locked_by = null,
        updated_at = v_now
    from candidates c
    where j.id = c.id
    returning j.id
  )
  select count(*) into v_reconciled from reconciled;

  -- Une lease expiree avec un budget restant redevient reclamable sans perdre
  -- une mission enregistree dans payload/media_metadata.
  with candidates as (
    select j.id
    from public.media_processing_jobs j
    where j.job_type = p_job_type
      and j.status = 'processing'
      and j.attempt_count < j.max_attempts
      and (
        j.lock_expires_at <= v_now
        or (
          j.lock_expires_at is null
          and coalesce(j.locked_at, j.updated_at, j.created_at)
            <= v_now - interval '15 minutes'
        )
      )
    order by coalesce(j.lock_expires_at, j.updated_at), j.id
    for update skip locked
    limit v_limit
  ), recovered as (
    update public.media_processing_jobs j
    set status = 'retry_wait',
        progress = 0,
        available_at = v_now,
        error_code = 'processing_lease_expired',
        error_message = 'Le traitement interrompu a ete replace dans la file.',
        completed_at = null,
        locked_at = null,
        lock_expires_at = null,
        locked_by = null,
        updated_at = v_now
    from candidates c
    where j.id = c.id
    returning j.media_id
  )
  select count(*), coalesce(array_agg(media_id), '{}'::uuid[])
    into v_recovered, v_recovered_media_ids
  from recovered;

  if v_recovered > 0 then
    update public.pro_media_library m
    set processing_status = case
          when m.processing_status = 'ready' then 'ready'
          else 'failed_retryable'
        end,
        publication_status = case
          when m.publication_status = 'ready' then 'ready'
          else 'processing'
        end,
        processing_progress = case
          when m.processing_status = 'ready' then 100
          else 0
        end,
        processing_error_code = case
          when m.processing_status = 'ready' then null
          else 'processing_lease_expired'
        end,
        processing_error_message = case
          when m.processing_status = 'ready' then null
          else 'Le traitement interrompu va reprendre automatiquement.'
        end,
        processing_completed_at = case
          when m.processing_status = 'ready' then m.processing_completed_at
          else null
        end,
        updated_at = v_now
    where m.id = any(v_recovered_media_ids);

    update public.publication_workspaces w
    set status = 'waiting_media', updated_at = v_now
    where w.status in ('draft', 'active', 'waiting_media', 'ready', 'failed')
      and exists (
        select 1
        from public.publication_workspace_media wm
        join public.pro_media_library m on m.id = wm.media_id
        where wm.workspace_id = w.id
          and wm.media_id = any(v_recovered_media_ids)
          and m.publication_status not in ('ready', 'legacy_ready')
      )
      and not exists (
        select 1
        from public.publication_workspace_media wm
        join public.pro_media_library m on m.id = wm.media_id
        where wm.workspace_id = w.id
          and (
            m.upload_status in ('failed', 'removed')
            or (
              m.processing_status = 'failed_terminal'
              and m.publication_status not in ('ready', 'legacy_ready')
            )
            or m.publication_status = 'failed'
          )
      )
      and w.status <> 'waiting_media';
  end if;

  -- Le claim historique exclut attempt_count = max_attempts. Sans cette passe,
  -- ces lignes resteraient processing pour toujours et bloqueraient Publier.
  with candidates as (
    select j.id
    from public.media_processing_jobs j
    where j.job_type = p_job_type
      and j.status = 'processing'
      and j.attempt_count >= j.max_attempts
      and (
        j.lock_expires_at <= v_now
        or (
          j.lock_expires_at is null
          and coalesce(j.locked_at, j.updated_at, j.created_at)
            <= v_now - interval '15 minutes'
        )
      )
    order by coalesce(j.lock_expires_at, j.updated_at), j.id
    for update skip locked
    limit v_limit
  ), terminalized as (
    update public.media_processing_jobs j
    set status = 'failed',
        progress = 0,
        error_code = 'processing_lease_expired_attempts_exhausted',
        error_message = 'Le traitement a ete interrompu et toutes les reprises ont ete utilisees.',
        completed_at = v_now,
        locked_at = null,
        lock_expires_at = null,
        locked_by = null,
        updated_at = v_now
    from candidates c
    where j.id = c.id
    returning j.media_id
  )
  select count(*), coalesce(array_agg(media_id), '{}'::uuid[])
    into v_terminalized, v_terminal_media_ids
  from terminalized;

  if v_terminalized > 0 then
    update public.media_variants v
    set status = 'failed',
        error_code = 'processing_lease_expired_attempts_exhausted',
        error_message = 'La preparation automatique du media a echoue.',
        updated_at = v_now
    where v.media_id = any(v_terminal_media_ids)
      and v.status not in ('ready', 'removed', 'failed');

    update public.pro_media_library m
    set processing_status = case
          when m.processing_status = 'ready' then 'ready'
          else 'failed_terminal'
        end,
        publication_status = case
          when m.publication_status = 'ready' then 'ready'
          else 'failed'
        end,
        processing_progress = case
          when m.processing_status = 'ready' then 100
          else 0
        end,
        processing_error_code = case
          when m.processing_status = 'ready' then null
          else 'processing_lease_expired_attempts_exhausted'
        end,
        processing_error_message = case
          when m.processing_status = 'ready' then null
          else 'La preparation automatique du media a echoue apres plusieurs reprises.'
        end,
        processing_completed_at = case
          when m.processing_status = 'ready' then m.processing_completed_at
          else v_now
        end,
        updated_at = v_now
    where m.id = any(v_terminal_media_ids);

    update public.publication_workspaces w
    set status = 'failed', updated_at = v_now
    where w.status in ('draft', 'active', 'waiting_media', 'ready', 'failed')
      and exists (
        select 1
        from public.publication_workspace_media wm
        join public.pro_media_library m on m.id = wm.media_id
        where wm.workspace_id = w.id
          and wm.media_id = any(v_terminal_media_ids)
          and m.processing_status = 'failed_terminal'
          and m.publication_status not in ('ready', 'legacy_ready')
      )
      and w.status <> 'failed';
  end if;

  return jsonb_build_object(
    'ok', true,
    'jobType', p_job_type,
    'reconciled', v_reconciled,
    'recovered', v_recovered,
    'terminalized', v_terminalized
  );
end;
$$;

revoke all on function public.inrcy_repair_expired_media_processing_jobs(text, integer)
  from public, anon, authenticated;
grant execute on function public.inrcy_repair_expired_media_processing_jobs(text, integer)
  to service_role;

comment on function public.inrcy_repair_expired_media_processing_jobs(text, integer) is
  'Reprend les leases media expirees, reconcilie les succes et terminalise explicitement les tentatives epuisees.';

commit;
