-- iNrCy -- Vérification en lecture seule de l'index du watcher TikTok.
-- Ce script ne crée, ne modifie et ne supprime rien.
--
-- Un CREATE INDEX CONCURRENTLY interrompu peut laisser un index présent mais
-- invalide. Le résultat distingue donc VALID, INVALID et MISSING, et expose la
-- définition effective pour contrôler les colonnes, le tri et le prédicat.

with inspected as (
  select
    to_regclass(
      'public.publication_deliveries_tiktok_processing_created_idx'
    ) as index_oid
)
select
  'publication_deliveries_tiktok_processing_created_idx' as index_name,
  case
    when inspected.index_oid is null then 'MISSING'
    when pg_index.indisvalid and pg_index.indisready then 'VALID'
    else 'INVALID'
  end as status,
  coalesce(pg_index.indisvalid, false) as indisvalid,
  coalesce(pg_index.indisready, false) as indisready,
  pg_get_indexdef(inspected.index_oid) as index_definition,
  pg_get_expr(pg_index.indpred, pg_index.indrelid) as index_predicate
from inspected
left join pg_index on pg_index.indexrelid = inspected.index_oid;
