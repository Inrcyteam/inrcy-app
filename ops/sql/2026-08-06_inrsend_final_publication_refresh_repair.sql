-- iNrCy -- Repair iNr'Send refresh for final publications
-- Run once in Supabase SQL Editor on production before or with the app deploy.
-- This repair is idempotent and can be executed again safely.

begin;

alter table if exists public.profiles
  add column if not exists inrsend_version bigint not null default 0;

-- Keep this repair independent from older versions of bump_profile_version.
create or replace function public.inrcy_bump_inrsend_version(
  p_row jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id_text text;
begin
  v_user_id_text := coalesce(p_row ->> 'user_id', '');
  if v_user_id_text = '' then
    return;
  end if;

  update public.profiles
  set inrsend_version = coalesce(inrsend_version, 0) + 1
  where user_id = v_user_id_text::uuid;
exception
  when invalid_text_representation then
    return;
end;
$$;

revoke all on function public.inrcy_bump_inrsend_version(jsonb) from public;

-- Final `publish` rows are real iNr'Send history entries. They must bump the
-- dedicated counter. Technical queue rows remain silent to avoid refresh storms.
create or replace function public.inrcy_app_event_is_inrsend_visible(p_row jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select lower(coalesce(p_row ->> 'module', '')) = any (
    array['booster', 'propulser', 'fideliser']::text[]
  )
  and lower(coalesce(p_row ->> 'type', '')) <> all (
    array[
      'publish_idempotency_lock',
      'execution_idempotency_lock',
      'idempotency_lock',
      'publish_async_job',
      'publish_async_channel'
    ]::text[]
  );
$$;

create or replace function public.inrcy_bump_inrsend_for_app_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new_visible boolean := public.inrcy_app_event_is_inrsend_visible(v_new);
  v_old_visible boolean := public.inrcy_app_event_is_inrsend_visible(v_old);
begin
  if not v_new_visible and not v_old_visible then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE'
    and v_new_visible = v_old_visible
    and jsonb_build_object(
      'module', v_new -> 'module',
      'type', v_new -> 'type',
      'payload', v_new -> 'payload'
    ) is not distinct from jsonb_build_object(
      'module', v_old -> 'module',
      'type', v_old -> 'type',
      'payload', v_old -> 'payload'
    ) then
    return new;
  end if;

  perform public.inrcy_bump_inrsend_version(
    case when v_new_visible then v_new else v_old end
  );
  return coalesce(new, old);
end;
$$;

-- Recreate the trigger defensively in case the previous migration was only
-- partially applied.
do $$
begin
  if to_regclass('public.app_events') is not null then
    execute 'drop trigger if exists trg_app_events_bump_inrsend_version on public.app_events';
    execute 'create trigger trg_app_events_bump_inrsend_version after insert or update or delete on public.app_events for each row execute function public.inrcy_bump_inrsend_for_app_events()';
  end if;
end $$;

commit;
