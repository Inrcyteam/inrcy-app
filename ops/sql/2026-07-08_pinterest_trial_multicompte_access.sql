-- iNrCy - Pinterest Trial - accès multicompte
-- Idempotent et non destructif.
-- Crée la ligne Bubble Access Pinterest pour chaque établissement iNrCy existant.
-- Par défaut: désactivé. L'activation reste pilotée par l'admin iNrCy.

begin;

insert into public.app_bubble_access (user_id, bubble_key, enabled)
select a.id, 'pinterest', false
from public.inrcy_accounts a
on conflict (user_id, bubble_key) do nothing;

commit;

-- Contrôle facultatif:
-- select a.id, a.display_name, aba.enabled
-- from public.inrcy_accounts a
-- left join public.app_bubble_access aba
--   on aba.user_id = a.id
--  and aba.bubble_key = 'pinterest'
-- order by a.display_name;
