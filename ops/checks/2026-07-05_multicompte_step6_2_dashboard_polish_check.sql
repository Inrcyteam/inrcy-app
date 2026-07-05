-- iNrCy multicompte - QA Etape 6.2
-- Doit retourner 0 ligne.

select 'anomaly_inr_agent_disabled' as anomaly, a.id as account_id
from public.inrcy_accounts a
left join public.app_bubble_access access
  on access.user_id = a.id
 and access.bubble_key = 'inr_agent'
where coalesce(access.enabled, false) is distinct from true;

select 'anomaly_create_establishment_missing' as anomaly
where to_regprocedure('public.inrcy_create_establishment(text)') is null;
