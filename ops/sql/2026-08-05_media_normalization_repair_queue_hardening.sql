-- Filets de reprise image/vidéo : indexer uniquement les préparations qui ont
-- réellement été demandées. Les originaux source_only/not_requested ne doivent
-- jamais entrer dans le scan périodique.
--
-- CONCURRENTLY garde la table disponible. Ce fichier ne doit pas être englobé
-- dans BEGIN/COMMIT par le client SQL.

create index concurrently if not exists pro_media_library_requested_repair_idx
  on public.pro_media_library (media_type, updated_at, id)
  where upload_status = 'uploaded'
    and processing_status = 'not_requested'
    and (media_metadata->>'pipeline_mission') in (
      'ai_preparation',
      'publication_preparation'
    );

comment on index public.pro_media_library_requested_repair_idx is
  'Reprise bornée des seules préparations média explicitement demandées; exclut les originaux source_only.';
