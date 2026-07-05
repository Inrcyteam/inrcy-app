-- iNrCy multicompte — QA Étape 6.1 scope-lockdown
-- Résultat attendu : aucune ligne anomaly_*.

-- Les anciennes RPC stats implicites (auth.uid() => user_id métier) ne doivent plus exister.
select 'anomaly_legacy_daily_stats_rpc_signature' as anomaly, p.oid::regprocedure::text as function_signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid::regprocedure::text in (
    'claim_daily_stats_refresh(date,integer)',
    'complete_daily_stats_refresh(date)',
    'release_daily_stats_refresh_claim(date)'
  );

-- Les nouvelles signatures explicites par établissement doivent exister.
select 'anomaly_missing_scoped_daily_stats_claim_rpc' as anomaly
where to_regprocedure('public.claim_daily_stats_refresh(uuid,date,integer)') is null;

select 'anomaly_missing_scoped_daily_stats_complete_rpc' as anomaly
where to_regprocedure('public.complete_daily_stats_refresh(uuid,date)') is null;

select 'anomaly_missing_scoped_daily_stats_release_rpc' as anomaly
where to_regprocedure('public.release_daily_stats_refresh_claim(uuid,date)') is null;

-- Aucune nouvelle RPC stats ne doit déduire le user_id métier de auth.uid().
select 'anomaly_daily_stats_rpc_uses_auth_uid_as_business_scope' as anomaly,
       p.oid::regprocedure::text as function_signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'claim_daily_stats_refresh',
    'complete_daily_stats_refresh',
    'release_daily_stats_refresh_claim'
  )
  and pg_get_functiondef(p.oid) ~* 'v_user_id[[:space:]]+uuid[[:space:]]*:=[[:space:]]*auth[.]uid[(][)]';

-- Les RLS du verrou quotidien doivent vérifier l'accès à l'établissement.
select 'anomaly_daily_stats_rls_not_account_scoped' as anomaly,
       policyname,
       qual,
       with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'user_daily_stats_refresh'
  and (
    (qual is not null and qual !~* 'inrcy_can_access_account')
    or (with_check is not null and with_check !~* 'inrcy_can_access_account')
  );

-- La table de verrou stats doit elle-même appartenir au socle établissement.
select 'anomaly_daily_stats_fk_not_account_scoped' as anomaly,
       c.conname as constraint_name,
       c.confrelid::regclass::text as referenced_table
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
join pg_attribute a
  on a.attrelid = c.conrelid
 and a.attnum = c.conkey[1]
where c.contype = 'f'
  and n.nspname = 'public'
  and t.relname = 'user_daily_stats_refresh'
  and cardinality(c.conkey) = 1
  and a.attname = 'user_id'
  and c.confrelid <> 'public.inrcy_accounts'::regclass;
