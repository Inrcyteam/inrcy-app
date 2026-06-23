-- Booster / Publier - accepte les videos source jusqu'a 100 Mo.
-- A executer dans Supabase SQL Editor avant de deployer le changement applicatif.
-- Les variantes finales publiees restent limitees a 40 Mo cote application.

update storage.buckets as b
set
  file_size_limit = greatest(coalesce(b.file_size_limit, 0), 104857600), -- 100 Mo
  allowed_mime_types = case
    -- Si le bucket etait sans restriction MIME, on le laisse sans restriction.
    when b.allowed_mime_types is null then null
    else (
      select array_agg(distinct mime)
      from unnest(
        b.allowed_mime_types
        || array[
          'image/png',
          'image/jpeg',
          'image/jpg',
          'image/webp',
          'image/gif',
          'image/avif',
          'image/heic',
          'image/heif',
          'video/mp4',
          'video/webm',
          'video/quicktime',
          'video/x-m4v'
        ]::text[]
      ) as allowed(mime)
    )
  end
where b.id = 'booster';
