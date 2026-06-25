-- Harmonisation des limites médias iNrCy
-- Objectif : stockage cohérent avec Booster / Publier.
-- Images : 40 Mo max par fichier.
-- Vidéos source : 100 Mo max par fichier.
-- Publication Booster : jusqu'à 5 images avec 40 Mo cumulés, ou 1 vidéo source 100 Mo préparée ensuite.

-- Médiathèque pro : accepte images + vidéos.
update storage.buckets
set
  file_size_limit = 104857600, -- 100 Mo, la limite image reste contrôlée côté application à 40 Mo
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-m4v'
  ]
where id = 'inrcy-pro-media';

-- Banque d'images iNrCy Admin : images uniquement, 40 Mo max.
update storage.buckets
set
  file_size_limit = greatest(coalesce(file_size_limit, 0), 41943040), -- 40 Mo
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
where id = 'inrcy-image-bank';
