-- Verification en lecture seule apres la migration de lease video.

select
  to_regprocedure(
    'public.inrcy_claim_video_normalization_jobs(text,integer,integer)'
  ) is not null as video_claim_function_ready;

select
  job_type,
  status,
  attempt_count,
  max_attempts,
  locked_at,
  lock_expires_at,
  extract(epoch from (lock_expires_at - locked_at))::integer as lease_seconds
from public.media_processing_jobs
where job_type = 'video_normalize_v1'
  and status = 'processing'
order by locked_at desc nulls last
limit 10;
