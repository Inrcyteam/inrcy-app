-- Read-only verification: every row should return ok = true.
select 'profiles.inrsend_version exists' as check_name,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'inrsend_version'
  ) as ok
union all
select 'final publish is visible',
  public.inrcy_app_event_is_inrsend_visible(
    jsonb_build_object('module', 'booster', 'type', 'publish')
  )
union all
select 'async parent stays silent',
  not public.inrcy_app_event_is_inrsend_visible(
    jsonb_build_object('module', 'booster', 'type', 'publish_async_job')
  )
union all
select 'async channel stays silent',
  not public.inrcy_app_event_is_inrsend_visible(
    jsonb_build_object('module', 'booster', 'type', 'publish_async_channel')
  )
union all
select 'app_events trigger installed',
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'app_events'
      and t.tgname = 'trg_app_events_bump_inrsend_version'
      and not t.tgisinternal
  );
