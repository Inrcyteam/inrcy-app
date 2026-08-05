-- iNrCy -- Index du watcher TikTok minute.
--
-- Le watcher ne parcourt que les livraisons TikTok encore en traitement,
-- récentes et triées de la plus récente à la plus ancienne. Cet index partiel
-- évite de relire et retrier les livraisons des autres canaux ou déjà terminées.
--
-- IMPORTANT : exécuter ce fichier seul, hors de tout BEGIN/COMMIT explicite.
-- PostgreSQL interdit CREATE INDEX CONCURRENTLY dans un bloc de transaction.
-- CONCURRENTLY garde la table disponible pendant la construction de l'index.

create index concurrently if not exists publication_deliveries_tiktok_processing_created_idx
  on public.publication_deliveries (created_at desc, publication_id, user_id)
  where channel = 'tiktok'
    and status = 'processing';
