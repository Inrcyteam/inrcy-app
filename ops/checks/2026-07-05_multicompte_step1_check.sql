-- Contrôle post-déploiement — iNrCy multicompte étape 1
-- Toutes les colonnes d'anomalies doivent être à 0.

select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.inrcy_accounts) as inrcy_accounts,
  (select count(*) from public.inrcy_account_members) as account_memberships,
  (select count(*) from public.inrcy_multi_account_config) as multi_account_configs;

select
  (select count(*)
   from auth.users u
   left join public.inrcy_accounts a on a.id = u.id
   where a.id is null) as missing_historical_accounts,

  (select count(*)
   from auth.users u
   left join public.inrcy_account_members m
     on m.auth_user_id = u.id
    and m.account_id = u.id
   where m.auth_user_id is null) as missing_historical_memberships,

  (select count(*)
   from auth.users u
   left join public.inrcy_multi_account_config c on c.auth_user_id = u.id
   where c.auth_user_id is null) as missing_multi_account_configs,

  (select count(*)
   from public.inrcy_account_members m
   left join auth.users u on u.id = m.auth_user_id
   where u.id is null) as orphan_auth_memberships,

  (select count(*)
   from public.inrcy_account_members m
   left join public.inrcy_accounts a on a.id = m.account_id
   where a.id is null) as orphan_account_memberships;

select auth_user_id, count(*) as default_count
from public.inrcy_account_members
where is_default
 group by auth_user_id
having count(*) > 1;

select auth_user_id, multi_account_enabled, max_establishments
from public.inrcy_multi_account_config
where max_establishments < 1
   or (multi_account_enabled = false and max_establishments <> 1);
