-- iNrCy - remplacement de la bulle iNr'Agent par YouTube Shorts
-- Objectif : créer l'accès activable/désactivable "youtube_shorts" pour les comptes existants.
-- Si app_bubble_access.bubble_key est un champ TEXT, cette requête suffit.
-- Si votre base utilise une contrainte CHECK ou un ENUM sur bubble_key,
-- ajoutez aussi la valeur 'youtube_shorts' à cette contrainte/ENUM avant d'exécuter ce script.

insert into app_bubble_access (user_id, bubble_key, enabled)
select distinct aba.user_id, 'youtube_shorts', false
from app_bubble_access aba
where not exists (
  select 1
  from app_bubble_access existing
  where existing.user_id = aba.user_id
    and existing.bubble_key = 'youtube_shorts'
);
