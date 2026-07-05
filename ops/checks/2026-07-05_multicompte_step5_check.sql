-- iNrCy multicompte — contrôle Étape 5
-- Résultat attendu : aucune ligne anomaly_*.

-- Chaque établissement doit avoir son profil métier indépendant.
select 'anomaly_account_without_profile' as anomaly, a.id as account_id
from public.inrcy_accounts a
left join public.profiles p on p.user_id = a.id
where p.user_id is null;

-- Chaque établissement doit être accessible via au moins un membership.
select 'anomaly_account_without_member' as anomaly, a.id as account_id
from public.inrcy_accounts a
left join public.inrcy_account_members m on m.account_id = a.id
where m.account_id is null;

-- Un établissement secondaire ne doit jamais posséder un abonnement propre.
-- Mon abonnement reste rattaché au compte AUTH général.
select 'anomaly_secondary_account_with_subscription' as anomaly, a.id as account_id
from public.inrcy_accounts a
join public.subscriptions s on s.user_id = a.id
where not exists (
  select 1 from auth.users u where u.id = a.id
);

-- La RPC active doit toujours exister après remplacement Étape 5.
select 'anomaly_missing_create_establishment_rpc' as anomaly
where to_regprocedure('public.inrcy_create_establishment(text)') is null;
