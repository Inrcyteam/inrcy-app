-- iNrCy multicompte — QA finale Étape 6
-- Résultat attendu : aucune ligne anomaly_*.

-- Chaque AUTH doit avoir son établissement principal avec le même UUID.
select 'anomaly_auth_without_primary_account' as anomaly, u.id as auth_user_id
from auth.users u
left join public.inrcy_accounts a on a.id = u.id
where a.id is null;

-- Chaque AUTH doit accéder à son établissement principal.
select 'anomaly_auth_without_primary_membership' as anomaly, u.id as auth_user_id
from auth.users u
left join public.inrcy_account_members m
  on m.auth_user_id = u.id
 and m.account_id = u.id
where m.account_id is null;

-- Chaque AUTH doit avoir sa configuration commerciale.
select 'anomaly_auth_without_multi_config' as anomaly, u.id as auth_user_id
from auth.users u
left join public.inrcy_multi_account_config c on c.auth_user_id = u.id
where c.auth_user_id is null;

-- Chaque établissement doit avoir un profil métier indépendant.
select 'anomaly_account_without_profile' as anomaly, a.id as account_id
from public.inrcy_accounts a
left join public.profiles p on p.user_id = a.id
where p.user_id is null;

-- Chaque établissement doit avoir au moins un membre.
select 'anomaly_account_without_member' as anomaly, a.id as account_id
from public.inrcy_accounts a
left join public.inrcy_account_members m on m.account_id = a.id
where m.account_id is null;

-- Chaque AUTH doit avoir exactement un établissement par défaut.
select 'anomaly_default_account_count' as anomaly, u.id as auth_user_id, count(m.account_id) filter (where m.is_default) as default_count
from auth.users u
left join public.inrcy_account_members m on m.auth_user_id = u.id
group by u.id
having count(m.account_id) filter (where m.is_default) <> 1;

-- Le quota ne doit jamais être inférieur au nombre d'établissements accessibles/créés.
select 'anomaly_quota_below_account_count' as anomaly,
       c.auth_user_id,
       c.max_establishments,
       count(m.account_id)::integer as account_count
from public.inrcy_multi_account_config c
left join public.inrcy_account_members m on m.auth_user_id = c.auth_user_id
group by c.auth_user_id, c.max_establishments
having c.max_establishments < count(m.account_id);

-- Mon abonnement reste AUTH-global : aucune ligne subscription pour un UUID secondaire.
select 'anomaly_secondary_account_with_subscription' as anomaly, a.id as account_id
from public.inrcy_accounts a
join public.subscriptions s on s.user_id = a.id
where not exists (select 1 from auth.users u where u.id = a.id);

-- Aucune FK métier user_id (hors subscriptions) ne doit encore viser auth.users.
select 'anomaly_business_fk_still_targets_auth_users' as anomaly,
       n.nspname as schema_name,
       t.relname as table_name,
       c.conname as constraint_name
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
join pg_attribute a
  on a.attrelid = c.conrelid
 and a.attnum = c.conkey[1]
where c.contype = 'f'
  and n.nspname = 'public'
  and cardinality(c.conkey) = 1
  and a.attname = 'user_id'
  and c.confrelid = 'auth.users'::regclass
  and t.relname <> 'subscriptions';

-- Aucune policy métier simple ne doit encore comparer directement user_id à auth.uid().
select 'anomaly_direct_auth_uid_rls' as anomaly,
       schemaname,
       tablename,
       policyname
from pg_policies
where schemaname = 'public'
  and tablename <> 'subscriptions'
  and (
    coalesce(qual, '') ~* 'auth[.]uid[(][)][[:space:]]*=[[:space:]]*([a-zA-Z_][a-zA-Z0-9_]*[.])?user_id'
    or coalesce(qual, '') ~* '([a-zA-Z_][a-zA-Z0-9_]*[.])?user_id[[:space:]]*=[[:space:]]*auth[.]uid[(][)]'
    or coalesce(with_check, '') ~* 'auth[.]uid[(][)][[:space:]]*=[[:space:]]*([a-zA-Z_][a-zA-Z0-9_]*[.])?user_id'
    or coalesce(with_check, '') ~* '([a-zA-Z_][a-zA-Z0-9_]*[.])?user_id[[:space:]]*=[[:space:]]*auth[.]uid[(][)]'
  );

-- Les trois tables de socle doivent avoir RLS activée.
select 'anomaly_multicompte_rls_disabled' as anomaly, c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('inrcy_accounts', 'inrcy_account_members', 'inrcy_multi_account_config')
  and not c.relrowsecurity;

-- Les fonctions centrales doivent exister.
select 'anomaly_missing_access_function' as anomaly
where to_regprocedure('public.inrcy_can_access_account(uuid)') is null;

select 'anomaly_missing_create_establishment_rpc' as anomaly
where to_regprocedure('public.inrcy_create_establishment(text)') is null;

select 'anomaly_missing_admin_config_rpc' as anomaly
where to_regprocedure('public.inrcy_set_multi_account_config(uuid,boolean,integer)') is null;
