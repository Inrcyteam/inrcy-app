-- iNrCy - accès bulles Pinterest + Trustpilot
-- Objectif : créer les accès activables/désactivables pour tous les comptes existants.
-- Défaut volontaire : désactivé, pour laisser l'admin iNrCy activer depuis Bubble Access.
-- Si app_bubble_access.bubble_key est un champ TEXT, ce script suffit.
-- Si la base utilise une contrainte CHECK ou un ENUM sur bubble_key,
-- ajouter aussi les valeurs 'pinterest' et 'trustpilot' à la contrainte/ENUM avant exécution.

insert into app_bubble_access (user_id, bubble_key, enabled)
select u.id, 'pinterest', false
from auth.users u
on conflict (user_id, bubble_key) do nothing;

insert into app_bubble_access (user_id, bubble_key, enabled)
select u.id, 'trustpilot', false
from auth.users u
on conflict (user_id, bubble_key) do nothing;

-- Fallback si certains environnements n'autorisent pas auth.users dans l'éditeur SQL :
-- insert into app_bubble_access (user_id, bubble_key, enabled)
-- select distinct aba.user_id, 'pinterest', false
-- from app_bubble_access aba
-- on conflict (user_id, bubble_key) do nothing;
--
-- insert into app_bubble_access (user_id, bubble_key, enabled)
-- select distinct aba.user_id, 'trustpilot', false
-- from app_bubble_access aba
-- on conflict (user_id, bubble_key) do nothing;
