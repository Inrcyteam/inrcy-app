-- TikTok est désormais validé et accessible par défaut pour tous les comptes.
-- Pinterest est active par la migration Standard du 27 juillet 2026.

begin;

insert into public.app_bubble_access (user_id, bubble_key, enabled)
select account.id, 'tiktok', true
from public.inrcy_accounts account
on conflict (user_id, bubble_key) do update
set enabled = true;

commit;

-- Contrôle facultatif : aucune ligne TikTok ne doit rester désactivée.
-- select user_id, bubble_key, enabled
-- from public.app_bubble_access
-- where bubble_key = 'tiktok' and enabled is not true;
