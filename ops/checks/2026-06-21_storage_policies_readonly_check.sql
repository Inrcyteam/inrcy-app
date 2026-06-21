-- Controle read-only des buckets et policies Storage iNrCy.
-- Ce script ne modifie rien.

select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id in (
  'logos',
  'inrbox_attachments',
  'booster',
  'inr-agent-reports',
  'inrcy-image-bank'
)
order by id;

select
  policyname,
  cmd,
  roles,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (
    policyname ilike 'logos_%'
    or policyname ilike 'inrbox_attachments_%'
  )
order by
  case
    when policyname ilike 'logos_%' then 1
    when policyname ilike 'inrbox_attachments_%' then 2
    else 3
  end,
  policyname;
