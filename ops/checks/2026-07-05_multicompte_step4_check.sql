-- iNrCy multicompte — contrôle Étape 4
-- Résultat attendu : aucune ligne anomaly_*.

-- Tous les comptes AUTH doivent avoir leur établissement principal, leur membership et leur config.
select 'anomaly_auth_without_main_account' as anomaly, u.id
from auth.users u
left join public.inrcy_accounts a on a.id = u.id
where a.id is null;

select 'anomaly_auth_without_main_membership' as anomaly, u.id
from auth.users u
left join public.inrcy_account_members m
  on m.auth_user_id = u.id
 and m.account_id = u.id
where m.account_id is null;

select 'anomaly_auth_without_multi_config' as anomaly, u.id
from auth.users u
left join public.inrcy_multi_account_config c on c.auth_user_id = u.id
where c.auth_user_id is null;

-- Le plafond ne doit jamais être inférieur à 1 ni au nombre d'établissements déjà accessibles.
select
  'anomaly_max_below_account_count' as anomaly,
  c.auth_user_id,
  c.max_establishments,
  count(m.account_id) as account_count
from public.inrcy_multi_account_config c
left join public.inrcy_account_members m on m.auth_user_id = c.auth_user_id
group by c.auth_user_id, c.max_establishments
having c.max_establishments < 1
    or c.max_establishments < count(m.account_id);

-- Vérifie la présence du trigger futur signup et de la RPC de création atomique.
select 'anomaly_missing_auth_provision_trigger' as anomaly
where not exists (
  select 1
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'auth'
    and c.relname = 'users'
    and t.tgname = 'inrcy_provision_auth_account_after_insert'
    and not t.tgisinternal
);

select 'anomaly_missing_create_establishment_rpc' as anomaly
where to_regprocedure('public.inrcy_create_establishment(text)') is null;

select 'anomaly_missing_set_multi_config_rpc' as anomaly
where to_regprocedure('public.inrcy_set_multi_account_config(uuid,boolean,integer)') is null;
