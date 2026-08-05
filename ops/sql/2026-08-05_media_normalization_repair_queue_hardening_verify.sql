select
  to_regclass('public.pro_media_library_requested_repair_idx') is not null
    as requested_repair_index_present;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'pro_media_library_processing_queue_idx',
    'pro_media_library_requested_repair_idx'
  )
order by indexname;
