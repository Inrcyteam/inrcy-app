-- iNrCy -- Publication realtime/load hardening
--
-- The trigger replacement is transactional. The indexes are created
-- concurrently after COMMIT so publication writes remain available while the
-- potentially large app_events indexes are built. Do not wrap this whole file
-- in an outer transaction.

begin;

create or replace function public.inrcy_publication_delivery_status_is_terminal(
  p_status text
)
returns boolean
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select lower(coalesce(p_status, '')) = any (
    array['delivered', 'failed', 'deleted']::text[]
  );
$$;

-- Atomic app-event patch used by channel workers and the recovery cron. This
-- replaces SELECT payload -> JavaScript merge -> UPDATE, which both doubled
-- PostgREST traffic and allowed concurrent patches to overwrite each other.
create or replace function public.inrcy_patch_app_event_payload(
  p_event_id uuid,
  p_user_id uuid,
  p_event_type text,
  p_patch jsonb
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.app_events
  set payload = coalesce(payload, '{}'::jsonb)
    || coalesce(p_patch, '{}'::jsonb)
    || jsonb_build_object('updatedAt', now())
  where id = p_event_id
    and user_id = p_user_id
    and type = p_event_type
  returning payload;
$$;

revoke all on function public.inrcy_patch_app_event_payload(uuid, uuid, text, jsonb)
  from public;
grant execute on function public.inrcy_patch_app_event_payload(uuid, uuid, text, jsonb)
  to service_role;

-- Initial queued rows and queued -> processing transitions are deliberately
-- silent. The publications insert already announces the new publication.
-- A terminal row inserted by a legacy preflight remains useful. Async Booster
-- parents stay silent until their single atomic final transition below.
create or replace function public.inrcy_bump_publications_for_delivery_inserts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select distinct inserted.user_id::uuid
    from new_delivery_rows as inserted
    where inserted.user_id is not null
      and public.inrcy_publication_delivery_status_is_terminal(inserted.status::text)
      and not exists (
        select 1
        from public.app_events as async_parent
        where async_parent.id = inserted.publication_id
          and async_parent.user_id = inserted.user_id
          and async_parent.type = 'publish_async_job'
      )
  loop
    perform public.bump_profile_version(v_user_id, 'publications_version');
  end loop;

  return null;
end;
$$;

-- Notify only when a delivery reaches a final state, changes final state, or
-- leaves a final state for an explicit retry. Multiple rows changed by one SQL
-- statement produce only one profile update per user.
create or replace function public.inrcy_bump_publications_for_delivery_updates()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select distinct changed.user_id
    from (
      select updated.user_id::uuid as user_id
      from new_delivery_rows as updated
      inner join old_delivery_rows as previous using (id)
      where updated.user_id is not null
        and lower(coalesce(updated.status::text, ''))
          is distinct from lower(coalesce(previous.status::text, ''))
        and (
          public.inrcy_publication_delivery_status_is_terminal(updated.status::text)
          or public.inrcy_publication_delivery_status_is_terminal(previous.status::text)
        )
        and not exists (
          select 1
          from public.app_events as async_parent
          where async_parent.id = updated.publication_id
            and async_parent.user_id = updated.user_id
            and async_parent.type = 'publish_async_job'
        )
    ) as changed
  loop
    perform public.bump_profile_version(v_user_id, 'publications_version');
  end loop;

  return null;
end;
$$;

-- Physical deletes are uncommon but user-visible. Aggregate them as well.
create or replace function public.inrcy_bump_publications_for_delivery_deletes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select distinct deleted.user_id::uuid
    from old_delivery_rows as deleted
    where deleted.user_id is not null
      and not exists (
        select 1
        from public.app_events as async_parent
        where async_parent.id = deleted.publication_id
          and async_parent.user_id = deleted.user_id
          and async_parent.type = 'publish_async_job'
      )
  loop
    perform public.bump_profile_version(v_user_id, 'publications_version');
  end loop;

  return null;
end;
$$;

revoke all on function public.inrcy_bump_publications_for_delivery_inserts() from public;
revoke all on function public.inrcy_bump_publications_for_delivery_updates() from public;
revoke all on function public.inrcy_bump_publications_for_delivery_deletes() from public;

drop trigger if exists trg_publication_deliveries_bump_version
  on public.publication_deliveries;
drop trigger if exists trg_publication_deliveries_bump_version_insert
  on public.publication_deliveries;
drop trigger if exists trg_publication_deliveries_bump_version_update
  on public.publication_deliveries;
drop trigger if exists trg_publication_deliveries_bump_version_delete
  on public.publication_deliveries;

create trigger trg_publication_deliveries_bump_version_insert
after insert on public.publication_deliveries
referencing new table as new_delivery_rows
for each statement
execute function public.inrcy_bump_publications_for_delivery_inserts();

create trigger trg_publication_deliveries_bump_version_update
after update on public.publication_deliveries
referencing old table as old_delivery_rows new table as new_delivery_rows
for each statement
execute function public.inrcy_bump_publications_for_delivery_updates();

create trigger trg_publication_deliveries_bump_version_delete
after delete on public.publication_deliveries
referencing old table as old_delivery_rows
for each statement
execute function public.inrcy_bump_publications_for_delivery_deletes();

-- Booster channel workers finish independently. Bumping the same profile row
-- after every delivery would serialize 1-10 otherwise parallel workers and
-- emit as many expensive dashboard refreshes. The delivery triggers above are
-- silent while their durable parent is technical; this single transition is
-- the atomic notification that the complete balance is now readable.
create or replace function public.inrcy_bump_publications_for_async_job_finalization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.bump_profile_version(new.user_id::uuid, 'publications_version');
  return null;
end;
$$;

revoke all on function public.inrcy_bump_publications_for_async_job_finalization()
  from public;

drop trigger if exists trg_app_events_bump_async_publication_finalization
  on public.app_events;

create trigger trg_app_events_bump_async_publication_finalization
after update of type on public.app_events
for each row
when (
  old.type = 'publish_async_job'
  and new.type is distinct from old.type
)
execute function public.inrcy_bump_publications_for_async_job_finalization();

commit;

-- Hot lookup used by every channel status update and by iNrSend actions.
create index concurrently if not exists publication_deliveries_user_publication_channel_idx
  on public.publication_deliveries (user_id, publication_id, channel);

-- General iNrSend history scan ordered newest first.
create index concurrently if not exists app_events_user_created_id_idx
  on public.app_events (user_id, created_at desc, id);

-- Cron queue: avoid sorting/scanning unrelated history events.
create index concurrently if not exists app_events_async_channel_queue_idx
  on public.app_events (created_at, id)
  where type = 'publish_async_channel';

-- Queue/recovery state is stored in the technical payload. Index the two
-- expressions used by the minute cron so a backlog never becomes a JSON scan.
create index concurrently if not exists app_events_async_channel_state_activity_idx
  on public.app_events (
    (payload->>'status'),
    (payload->>'updatedAt'),
    created_at,
    id
  )
  where type = 'publish_async_channel';

-- Reconciliation of pending parent jobs for a single account.
create index concurrently if not exists app_events_async_parent_user_created_idx
  on public.app_events (user_id, created_at desc, id)
  where type = 'publish_async_job';

create index concurrently if not exists app_events_async_parent_state_activity_idx
  on public.app_events (
    (payload->>'status'),
    (payload->>'updatedAt'),
    created_at,
    id
  )
  where type = 'publish_async_job';

-- Propulser metrics must never scan/download publication job payloads.
create index concurrently if not exists app_events_propulser_metrics_user_created_idx
  on public.app_events (user_id, created_at desc)
  where module in ('propulser', 'booster')
    and type in ('valorize', 'review_mail', 'promo_mail');

-- Booster has a distinct metrics contract: only completed publications and
-- its two tracked mail types are read. In particular, never include the large
-- publish_async_job / publish_async_channel transport payloads in this index.
create index concurrently if not exists app_events_booster_metrics_user_created_idx
  on public.app_events (user_id, created_at desc)
  where module = 'booster'
    and type in ('publish', 'review_mail', 'promo_mail');
