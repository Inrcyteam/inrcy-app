-- Optionnel mais recommandé : ajoute des colonnes de diagnostic Instagram dans publication_deliveries.
-- Le correctif fonctionne déjà via app_events.payload, mais ces colonnes facilitent le suivi/admin.

alter table public.publication_deliveries
  add column if not exists instagram_media_type text null,
  add column if not exists instagram_parent_media_id text null,
  add column if not exists instagram_child_media_ids jsonb not null default '[]'::jsonb,
  add column if not exists instagram_delete_diagnostics jsonb null;

create index if not exists publication_deliveries_instagram_parent_idx
  on public.publication_deliveries (instagram_parent_media_id)
  where instagram_parent_media_id is not null;
