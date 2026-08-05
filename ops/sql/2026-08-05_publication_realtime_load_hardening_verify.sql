-- iNrCy -- Vérification lecture seule après le durcissement publication.
-- Ce script ne crée, ne modifie et ne supprime rien.
--
-- Un CREATE INDEX CONCURRENTLY interrompu peut laisser un index présent mais
-- invalide. Dans ce cas, IF NOT EXISTS ne suffit pas à le réparer : le statut
-- INVALID doit donc être distingué de MISSING et VALID.

with wanted(index_name) as (
  values
    ('publication_deliveries_user_publication_channel_idx'),
    ('app_events_user_created_id_idx'),
    ('app_events_async_channel_queue_idx'),
    ('app_events_async_channel_state_activity_idx'),
    ('app_events_async_parent_user_created_idx'),
    ('app_events_async_parent_state_activity_idx'),
    ('app_events_propulser_metrics_user_created_idx'),
    ('app_events_booster_metrics_user_created_idx')
), inspected as (
  select
    wanted.index_name,
    to_regclass('public.' || wanted.index_name) as index_oid
  from wanted
)
select
  inspected.index_name,
  case
    when inspected.index_oid is null then 'MISSING'
    when pg_index.indisvalid and pg_index.indisready then 'VALID'
    else 'INVALID'
  end as status,
  coalesce(pg_index.indisvalid, false) as indisvalid,
  coalesce(pg_index.indisready, false) as indisready
from inspected
left join pg_index on pg_index.indexrelid = inspected.index_oid
order by inspected.index_name;
