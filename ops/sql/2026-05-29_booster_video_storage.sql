-- Booster / Publier — préparation du bucket Storage pour les vidéos.
-- À exécuter dans Supabase SQL Editor si le bucket `booster` a une limite stricte ou des MIME types verrouillés.

update storage.buckets as b
set
  file_size_limit = greatest(coalesce(b.file_size_limit, 0), 41943040), -- 40 Mo
  allowed_mime_types = case
    -- Si le bucket était sans restriction MIME, on le laisse sans restriction.
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
