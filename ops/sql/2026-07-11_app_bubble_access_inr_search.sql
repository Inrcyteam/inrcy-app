-- iNrCy — Bubble Access iNr'Search
-- Objectif : ajouter iNr'Search comme outil administrable à distance.
-- État par défaut demandé : ACTIVÉ.
--
-- La clé technique officielle est désormais : inr_search
-- L'ancienne clé trustpilot n'est plus utilisée par l'application.
--
-- IMPORTANT : bubble_key doit accepter une valeur TEXT libre ou inclure 'inr_search'
-- dans son éventuelle contrainte CHECK / ENUM avant l'exécution de ce script.

begin;

-- 1) Tous les comptes déjà connus de Bubble Access (y compris les sous-comptes)
-- reçoivent iNr'Search activé par défaut.
insert into public.app_bubble_access (user_id, bubble_key, enabled)
select distinct existing.user_id, 'inr_search', true
from public.app_bubble_access existing
where existing.user_id is not null
on conflict (user_id, bubble_key) do nothing;

-- 2) Tous les utilisateurs Auth existants le reçoivent également.
insert into public.app_bubble_access (user_id, bubble_key, enabled)
select auth_user.id, 'inr_search', true
from auth.users auth_user
on conflict (user_id, bubble_key) do nothing;

-- 3) Nettoyage de l'ancienne entrée technique Trustpilot, devenue obsolète.
-- Le template mail Trustpilot n'est pas concerné : il ne dépend pas de cette table.
delete from public.app_bubble_access
where bubble_key = 'trustpilot';

commit;

-- Contrôle conseillé après exécution :
-- select bubble_key, enabled, count(*)
-- from public.app_bubble_access
-- where bubble_key = 'inr_search'
-- group by bubble_key, enabled;
