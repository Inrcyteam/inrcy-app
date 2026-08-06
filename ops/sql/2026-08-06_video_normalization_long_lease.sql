-- iNrCy - lease video alignee sur une fonction Fluid Compute de 30 minutes.
-- Migration additive/idempotente : elle ne modifie aucun media ni aucun job.

begin;

create or replace function public.inrcy_claim_video_normalization_jobs(
  p_worker_id text,
  p_limit integer default 1,
  p_lease_seconds integer default 1860
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
    where j.job_type = 'video_normalize_v1'
      and j.attempt_count < j.max_attempts
      and (
        (j.status in ('queued', 'retry_wait') and j.available_at <= now())
        or
        (j.status = 'processing' and j.lock_expires_at is not null and j.lock_expires_at <= now())
      )
    order by j.priority desc, j.available_at asc, j.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 1), 1))
  )
  update public.media_processing_jobs j
  set status = 'processing',
      attempt_count = j.attempt_count + 1,
      progress = greatest(j.progress, 1),
      locked_at = now(),
      lock_expires_at = now() + make_interval(
        secs => greatest(120, least(coalesce(p_lease_seconds, 1860), 3600))
      ),
      locked_by = left(coalesce(nullif(btrim(p_worker_id), ''), 'video-worker'), 180),
      started_at = coalesce(j.started_at, now()),
      error_code = null,
      error_message = null,
      updated_at = now()
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;

revoke all on function public.inrcy_claim_video_normalization_jobs(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.inrcy_claim_video_normalization_jobs(text, integer, integer)
  to service_role;

comment on function public.inrcy_claim_video_normalization_jobs(text, integer, integer) is
  'Claim atomique d un job video avec lease longue, reserve au service_role.';

commit;
