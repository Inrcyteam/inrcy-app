-- iNrCy -- Read-only verification for iNr'Send automatic refresh.
-- Expected result: MIGRATION_APPLIED = true.

with expected_triggers(table_name, trigger_name) as (
  values
    ('send_items', 'trg_send_items_bump_inrsend_version'),
    ('mail_campaigns', 'trg_mail_campaigns_bump_inrsend_version'),
    ('app_events', 'trg_app_events_bump_inrsend_version'),
    ('inr_agent_actions', 'trg_inr_agent_actions_bump_inrsend_version'),
    ('inr_agent_scheduled_actions', 'trg_inr_agent_scheduled_actions_bump_inrsend_version')
), installed_triggers as (
  select
    expected.table_name,
    expected.trigger_name,
    to_regclass('public.' || expected.table_name) is not null as table_exists,
    exists (
      select 1
      from pg_trigger trigger_row
      join pg_class table_row on table_row.oid = trigger_row.tgrelid
      join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
      where schema_row.nspname = 'public'
        and table_row.relname = expected.table_name
        and trigger_row.tgname = expected.trigger_name
        and not trigger_row.tgisinternal
    ) as trigger_exists
  from expected_triggers expected
), checks as (
  select 'profiles.inrsend_version' as check_name,
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'inrsend_version'
        and data_type = 'bigint'
    ) as ok
  union all
  select 'bump_profile_version accepts inrsend_version',
    coalesce(pg_get_functiondef(to_regprocedure('public.bump_profile_version(uuid,text)')), '')
      ilike '%inrsend_version%'
  union all
  select 'profiles realtime enabled',
    exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'profiles'
    )
  union all
  select table_name || '.' || trigger_name,
    (not table_exists) or trigger_exists
  from installed_triggers
)
select check_name, ok
from checks
union all
select 'MIGRATION_APPLIED', bool_and(ok)
from checks
order by check_name;
