-- Read-only checks for dashboard onboarding step 2.

select
  to_regclass('public.inrcy_onboarding_states') as onboarding_table,
  to_regprocedure('public.inrcy_save_onboarding_state(uuid,text,text,smallint)') as save_rpc,
  to_regprocedure('public.inrcy_provision_onboarding_state()') as provision_function;

select status, current_step, version, count(*) as account_count
from public.inrcy_onboarding_states
group by status, current_step, version
order by version, status, current_step;

select count(*) as accounts_without_onboarding_state
from public.inrcy_accounts a
left join public.inrcy_onboarding_states s on s.account_id = a.id
where s.account_id is null;
