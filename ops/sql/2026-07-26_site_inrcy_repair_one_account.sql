-- Rattrapage du compte deja cree avec Site iNrCy active par erreur.
-- Remplacer l'email ci-dessous, puis executer dans Supabase SQL Editor.

begin;

with target_accounts as (
  select member.account_id
  from auth.users auth_user
  join public.inrcy_account_members member
    on member.auth_user_id = auth_user.id
  where lower(auth_user.email) = lower('REMPLACER_PAR_EMAIL_DU_COMPTE')
)
update public.app_bubble_access access
set enabled = false
where access.bubble_key = 'site_inrcy'
  and access.user_id in (select account_id from target_accounts);

commit;

-- Controle :
-- select auth_user.email, member.account_id, access.enabled
-- from auth.users auth_user
-- join public.inrcy_account_members member on member.auth_user_id = auth_user.id
-- left join public.app_bubble_access access
--   on access.user_id = member.account_id and access.bubble_key = 'site_inrcy'
-- where lower(auth_user.email) = lower('REMPLACER_PAR_EMAIL_DU_COMPTE');
