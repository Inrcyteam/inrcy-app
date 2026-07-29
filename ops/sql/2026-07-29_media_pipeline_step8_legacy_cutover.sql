-- iNrCy — Pipeline média universel — Étape 8
-- Bascule stricte hors des transports média historiques du navigateur.
--
-- Migration additive et idempotente :
--   * aucune table, colonne, fonction, index ou donnée supprimée ;
--   * ajoute uniquement les index utiles à la publication côté serveur ;
--   * le retour arrière reste immédiat par désactivation des flags Étape 8.

begin;

do $$
begin
  if to_regclass('public.publication_workspaces') is null
     or to_regclass('public.publication_workspace_media') is null
     or to_regclass('public.pro_media_library') is null
     or to_regclass('public.media_variants') is null then
    raise exception 'Pré-requis absent : appliquer les étapes 2 à 7 avant l étape 8.';
  end if;
end;
$$;

-- Retrouver rapidement une variante de publication déjà calculée pour un canal.
create index if not exists media_variants_channel_publish_lookup_idx
  on public.media_variants (
    account_id,
    media_id,
    channel,
    signature,
    updated_at desc
  )
  where status = 'ready' and purpose = 'channel_publish';

-- Suivre les workspaces qui traversent réellement la bascule de publication.
create index if not exists publication_workspaces_cutover_lifecycle_idx
  on public.publication_workspaces (account_id, status, updated_at desc)
  where status in ('ready', 'scheduled', 'publishing', 'failed');

comment on index public.media_variants_channel_publish_lookup_idx is
  'Étape 8 : réutilisation rapide des variantes de canal produites côté serveur.';

comment on index public.publication_workspaces_cutover_lifecycle_idx is
  'Étape 8 : suivi opérationnel des workspaces prêts, programmés, en publication ou en échec.';

commit;
