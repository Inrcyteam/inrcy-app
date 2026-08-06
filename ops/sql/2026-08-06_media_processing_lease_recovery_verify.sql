-- Verification en lecture seule apres la migration de reprise des leases.

select
  to_regprocedure(
    'public.inrcy_repair_expired_media_processing_jobs(text,integer)'
  ) is not null as lease_repair_function_ready,
  to_regclass(
    'public.media_processing_jobs_expired_lease_idx'
  ) is not null as expired_lease_index_ready;

select
  job_type,
  count(*) filter (
    where status = 'processing'
      and lock_expires_at <= now()
      and attempt_count < max_attempts
  ) as expired_recoverable,
  count(*) filter (
    where status = 'processing'
      and lock_expires_at <= now()
      and attempt_count >= max_attempts
  ) as expired_exhausted
from public.media_processing_jobs
where job_type in ('image_normalize_v1', 'video_normalize_v1')
group by job_type
order by job_type;
