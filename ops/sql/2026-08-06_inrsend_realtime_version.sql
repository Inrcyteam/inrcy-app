-- iNrCy -- iNr'Send automatic history refresh
-- Run this migration in Supabase before or together with the application deploy.
--
-- The existing publications_version remains the optimized publication signal.
-- inrsend_version covers direct mails, mail campaigns, drafts, visible workflow
-- events and iNr'Agent history without polling the full history table.

begin;

alter table if exists public.profiles
  add column if not exists inrsend_version bigint not null default 0;

-- Keep the existing version bump API and extend its allow-list.
create or replace function public.bump_profile_version(
  p_user_id uuid,
  p_column text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    return;
  end if;

  if p_column not in (
    'stats_version',
    'notifications_version',
    'docs_version',
    'loyalty_version',
    'publications_version',
    'inrsend_version'
  ) then
    raise exception 'Unsupported profile version column: %', p_column;
  end if;

  execute format(
    'update public.profiles set %1$I = coalesce(%1$I, 0) + 1 where user_id = $1',
    p_column
  )
  using p_user_id;
end;
$$;


-- Extract a user id without coupling the migration to every historical table
-- shape. AFTER triggers ignore the returned row, but returning it keeps the
-- helper safe if it is reused later.
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

  perform public.bump_profile_version(v_user_id_text::uuid, 'inrsend_version');
exception
  when invalid_text_representation then
    return;
end;
$$;

revoke all on function public.inrcy_bump_inrsend_version(jsonb) from public;

-- Direct mails, invoices, quotes and their drafts. Ignore purely technical
-- timestamp/body autosaves so typing in a draft cannot cause a refresh storm.
create or replace function public.inrcy_bump_inrsend_for_send_items()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
begin
  if tg_op = 'UPDATE' and jsonb_build_object(
    'status', v_new -> 'status',
    'type', v_new -> 'type',
    'folder', v_new -> 'folder',
    'track_kind', v_new -> 'track_kind',
    'track_type', v_new -> 'track_type',
    'subject', v_new -> 'subject',
    'to_emails', v_new -> 'to_emails',
    'attachments', v_new -> 'attachments',
    'provider', v_new -> 'provider',
    'error', v_new -> 'error',
    'sent_at', v_new -> 'sent_at'
  ) is not distinct from jsonb_build_object(
    'status', v_old -> 'status',
    'type', v_old -> 'type',
    'folder', v_old -> 'folder',
    'track_kind', v_old -> 'track_kind',
    'track_type', v_old -> 'track_type',
    'subject', v_old -> 'subject',
    'to_emails', v_old -> 'to_emails',
    'attachments', v_old -> 'attachments',
    'provider', v_old -> 'provider',
    'error', v_old -> 'error',
    'sent_at', v_old -> 'sent_at'
  ) then
    return new;
  end if;

  perform public.inrcy_bump_inrsend_version(
    case when tg_op = 'DELETE' then v_old else v_new end
  );
  return coalesce(new, old);
end;
$$;

-- Campaign progress is updated once per dispatch batch. Ignore heartbeat-only
-- changes such as updated_at/last_activity_at, while keeping visible counters,
-- errors, pauses and final states live in iNr'Send.
create or replace function public.inrcy_bump_inrsend_for_mail_campaigns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
begin
  if tg_op = 'UPDATE' and jsonb_build_object(
    'status', v_new -> 'status',
    'total_count', v_new -> 'total_count',
    'queued_count', v_new -> 'queued_count',
    'processing_count', v_new -> 'processing_count',
    'sent_count', v_new -> 'sent_count',
    'failed_count', v_new -> 'failed_count',
    'progress_percent', v_new -> 'progress_percent',
    'estimated_completion_at', v_new -> 'estimated_completion_at',
    'finished_at', v_new -> 'finished_at',
    'last_error', v_new -> 'last_error',
    'pause_reason', v_new -> 'pause_reason',
    'resume_at', v_new -> 'resume_at',
    'subject', v_new -> 'subject',
    'folder', v_new -> 'folder',
    'track_kind', v_new -> 'track_kind',
    'track_type', v_new -> 'track_type',
    'attachments', v_new -> 'attachments'
  ) is not distinct from jsonb_build_object(
    'status', v_old -> 'status',
    'total_count', v_old -> 'total_count',
    'queued_count', v_old -> 'queued_count',
    'processing_count', v_old -> 'processing_count',
    'sent_count', v_old -> 'sent_count',
    'failed_count', v_old -> 'failed_count',
    'progress_percent', v_old -> 'progress_percent',
    'estimated_completion_at', v_old -> 'estimated_completion_at',
    'finished_at', v_old -> 'finished_at',
    'last_error', v_old -> 'last_error',
    'pause_reason', v_old -> 'pause_reason',
    'resume_at', v_old -> 'resume_at',
    'subject', v_old -> 'subject',
    'folder', v_old -> 'folder',
    'track_kind', v_old -> 'track_kind',
    'track_type', v_old -> 'track_type',
    'attachments', v_old -> 'attachments'
  ) then
    return new;
  end if;

  perform public.inrcy_bump_inrsend_version(
    case when tg_op = 'DELETE' then v_old else v_new end
  );
  return coalesce(new, old);
end;
$$;

-- app_events contains technical locks and channel-worker rows. Only events that
-- can appear in iNr'Send are allowed to notify it. Final social publication
-- progress remains handled by the optimized publications_version migration.
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
      'publish_async_channel',
      'publish'
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

-- iNr'Agent rows are only queried by iNr'Send for completed/failed stats or
-- publication fallbacks. Draft preparation changes stay silent.
create or replace function public.inrcy_agent_action_is_inrsend_visible(p_row jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select (
    lower(coalesce(p_row ->> 'automation_key', '')) = 'stats'
    and lower(coalesce(p_row ->> 'action_type', '')) = 'stats_report'
  ) or (
    lower(coalesce(p_row ->> 'automation_key', '')) = 'publish'
    and lower(coalesce(p_row ->> 'action_type', '')) = 'publication'
    and lower(coalesce(p_row ->> 'target_tool', '')) = 'booster'
  );
$$;

create or replace function public.inrcy_bump_inrsend_for_agent_actions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new_visible boolean := public.inrcy_agent_action_is_inrsend_visible(v_new);
  v_old_visible boolean := public.inrcy_agent_action_is_inrsend_visible(v_old);
begin
  if not v_new_visible and not v_old_visible then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE'
    and v_new_visible = v_old_visible
    and jsonb_build_object(
      'status', v_new -> 'status',
      'completed_at', v_new -> 'completed_at',
      'last_error', v_new -> 'last_error',
      'payload', v_new -> 'payload',
      'title', v_new -> 'title',
      'summary', v_new -> 'summary',
      'preview_text', v_new -> 'preview_text'
    ) is not distinct from jsonb_build_object(
      'status', v_old -> 'status',
      'completed_at', v_old -> 'completed_at',
      'last_error', v_old -> 'last_error',
      'payload', v_old -> 'payload',
      'title', v_old -> 'title',
      'summary', v_old -> 'summary',
      'preview_text', v_old -> 'preview_text'
    ) then
    return new;
  end if;

  perform public.inrcy_bump_inrsend_version(
    case when v_new_visible then v_new else v_old end
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.inrcy_scheduled_action_is_inrsend_visible(p_row jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select lower(coalesce(p_row ->> 'automation_key', '')) = 'publish'
    and lower(coalesce(p_row ->> 'action_type', '')) = 'publication'
    and lower(coalesce(p_row ->> 'target_tool', '')) = 'booster'
    and lower(coalesce(p_row ->> 'status', '')) = any (
      array['done', 'failed']::text[]
    );
$$;

create or replace function public.inrcy_bump_inrsend_for_scheduled_actions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new_visible boolean := public.inrcy_scheduled_action_is_inrsend_visible(v_new);
  v_old_visible boolean := public.inrcy_scheduled_action_is_inrsend_visible(v_old);
begin
  if not v_new_visible and not v_old_visible then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE'
    and v_new_visible = v_old_visible
    and jsonb_build_object(
      'status', v_new -> 'status',
      'executed_at', v_new -> 'executed_at',
      'last_error', v_new -> 'last_error',
      'payload', v_new -> 'payload'
    ) is not distinct from jsonb_build_object(
      'status', v_old -> 'status',
      'executed_at', v_old -> 'executed_at',
      'last_error', v_old -> 'last_error',
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

revoke all on function public.inrcy_bump_inrsend_for_send_items() from public;
revoke all on function public.inrcy_bump_inrsend_for_mail_campaigns() from public;
revoke all on function public.inrcy_bump_inrsend_for_app_events() from public;
revoke all on function public.inrcy_bump_inrsend_for_agent_actions() from public;
revoke all on function public.inrcy_bump_inrsend_for_scheduled_actions() from public;

-- Create triggers only where the optional modules are installed.
do $$
begin
  if to_regclass('public.send_items') is not null then
    execute 'drop trigger if exists trg_send_items_bump_inrsend_version on public.send_items';
    execute 'create trigger trg_send_items_bump_inrsend_version after insert or update or delete on public.send_items for each row execute function public.inrcy_bump_inrsend_for_send_items()';
  end if;

  if to_regclass('public.mail_campaigns') is not null then
    execute 'drop trigger if exists trg_mail_campaigns_bump_inrsend_version on public.mail_campaigns';
    execute 'create trigger trg_mail_campaigns_bump_inrsend_version after insert or update or delete on public.mail_campaigns for each row execute function public.inrcy_bump_inrsend_for_mail_campaigns()';
  end if;

  if to_regclass('public.app_events') is not null then
    execute 'drop trigger if exists trg_app_events_bump_inrsend_version on public.app_events';
    execute 'create trigger trg_app_events_bump_inrsend_version after insert or update or delete on public.app_events for each row execute function public.inrcy_bump_inrsend_for_app_events()';
  end if;

  if to_regclass('public.inr_agent_actions') is not null then
    execute 'drop trigger if exists trg_inr_agent_actions_bump_inrsend_version on public.inr_agent_actions';
    execute 'create trigger trg_inr_agent_actions_bump_inrsend_version after insert or update or delete on public.inr_agent_actions for each row execute function public.inrcy_bump_inrsend_for_agent_actions()';
  end if;

  if to_regclass('public.inr_agent_scheduled_actions') is not null then
    execute 'drop trigger if exists trg_inr_agent_scheduled_actions_bump_inrsend_version on public.inr_agent_scheduled_actions';
    execute 'create trigger trg_inr_agent_scheduled_actions_bump_inrsend_version after insert or update or delete on public.inr_agent_scheduled_actions for each row execute function public.inrcy_bump_inrsend_for_scheduled_actions()';
  end if;
end $$;

-- profiles is already part of supabase_realtime in the base profile-version
-- migration. Keep replica identity explicit for installations created later.
alter table if exists public.profiles replica identity full;

do $$
begin
  if to_regclass('public.profiles') is not null and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

commit;
