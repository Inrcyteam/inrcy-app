-- Vérification en lecture seule de l'état final du workspace média mixte.
-- Résultat attendu : toutes les lignes ont ok = true et MIGRATION_APPLIED = true.

with checks as (
  select
    10 as sort_order,
    'position_constraint_exists_and_validated'::text as check_name,
    exists (
      select 1
      from pg_constraint c
      join pg_class rel on rel.oid = c.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
      where n.nspname = 'public'
        and rel.relname = 'publication_workspace_media'
        and c.conname = 'publication_workspace_media_position_check'
        and c.contype = 'c'
        and c.convalidated
        and pg_get_constraintdef(c.oid) ~ 'position.*>= 0'
        and pg_get_constraintdef(c.oid) ~ 'position.*<= 5'
    ) as ok,
    'Contrainte position 0..5 présente et validée'::text as details

  union all

  select
    20,
    'strict_mixed_validator_function_exists',
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'inrcy_validate_publication_workspace_media'
        and pg_get_function_identity_arguments(p.oid) = ''
        and pg_get_functiondef(p.oid) like '%new.position <> 5%'
        and pg_get_functiondef(p.oid) not like '%new.position not in (0, 5)%'
        and pg_get_functiondef(p.oid) like '%v_existing_image_count >= 5%'
    ),
    'Fonction finale : 5 images + 1 vidéo strictement en position 5'

  union all

  select
    30,
    'validation_trigger_enabled',
    exists (
      select 1
      from pg_trigger t
      join pg_class rel on rel.oid = t.tgrelid
      join pg_namespace n on n.oid = rel.relnamespace
      join pg_proc p on p.oid = t.tgfoid
      where n.nspname = 'public'
        and rel.relname = 'publication_workspace_media'
        and t.tgname = 'publication_workspace_media_validate'
        and not t.tgisinternal
        and t.tgenabled <> 'D'
        and p.proname = 'inrcy_validate_publication_workspace_media'
    ),
    'Trigger de validation actif et relié à la bonne fonction'

  union all

  select
    40,
    'no_transitional_or_invalid_media_positions',
    not exists (
      select 1
      from public.publication_workspace_media wm
      join public.pro_media_library media on media.id = wm.media_id
      where (media.media_type = 'image' and wm.position not between 0 and 4)
         or (media.media_type = 'video' and wm.position <> 5)
    ),
    'Images en positions 0..4 et toutes les vidéos en position 5'

  union all

  select
    50,
    'workspace_media_limits_respected',
    not exists (
      select 1
      from public.publication_workspace_media wm
      join public.pro_media_library media on media.id = wm.media_id
      group by wm.workspace_id
      having count(*) filter (where media.media_type = 'image') > 5
          or count(*) filter (where media.media_type = 'video') > 1
    ),
    'Aucun workspace ne dépasse 5 images ou 1 vidéo'
)
select sort_order, check_name, ok, details
from checks

union all

select
  999 as sort_order,
  'MIGRATION_APPLIED' as check_name,
  bool_and(ok) as ok,
  case
    when bool_and(ok) then 'Contrat média mixte final correctement installé'
    else 'Finalisation absente, incomplète ou données incohérentes'
  end as details
from checks
order by sort_order;
