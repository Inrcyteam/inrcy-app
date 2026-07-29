-- iNrCy — Pipeline média universel — Étape 7
-- Unification de Générer, Publier et Programmer autour du workspace persistant.
--
-- Migration additive et idempotente :
--   * aucune table, colonne, fonction ou donnée supprimée ;
--   * aucun contrat historique Booster / iNrAgent / iNrSend modifié ;
--   * ajoute uniquement les index de lecture des variantes normalisées ;
--   * la bascule runtime reste protégée par MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1.

begin;

do $$
begin
  if to_regclass('public.publication_workspaces') is null
     or to_regclass('public.publication_workspace_media') is null
     or to_regclass('public.pro_media_library') is null
     or to_regclass('public.media_variants') is null then
    raise exception 'Pré-requis absent : appliquer les étapes 2 à 6 avant l étape 7.';
  end if;
end;
$$;

-- Lecture ordonnée et stable des médias d'un workspace.
create index if not exists publication_workspace_media_workspace_position_media_idx
  on public.publication_workspace_media (workspace_id, position, media_id);

-- Lecture des seules variantes prêtes, scoped établissement + média + usage.
create index if not exists media_variants_ready_consumption_idx
  on public.media_variants (
    account_id,
    media_id,
    purpose,
    channel,
    updated_at desc
  )
  where status = 'ready';

-- Reprise opérationnelle des workspaces actifs ou programmés d'un établissement.
create index if not exists publication_workspaces_account_lifecycle_idx
  on public.publication_workspaces (account_id, status, updated_at desc)
  where status in ('active', 'waiting_media', 'ready', 'scheduled', 'publishing');

comment on index public.media_variants_ready_consumption_idx is
  'Étape 7 : lecture rapide des variantes canonique, aperçu IA, captures et audio prêtes.';

comment on index public.publication_workspace_media_workspace_position_media_idx is
  'Étape 7 : ordre stable des médias consommés par Générer, Publier et Programmer.';

comment on index public.publication_workspaces_account_lifecycle_idx is
  'Étape 7 : suivi du cycle actif, programmé et en publication des workspaces par établissement.';

commit;
