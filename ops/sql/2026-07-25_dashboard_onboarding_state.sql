-- iNrCy dashboard onboarding - Step 2
-- Persistent state per business account. Existing accounts are marked completed.
-- Accounts created after this migration start at profile / pending.

begin;

do $$
begin
  if to_regclass('public.inrcy_accounts') is null
     or to_regprocedure('public.inrcy_can_access_account(uuid)') is null
     or to_regprocedure('public.inrcy_touch_updated_at()') is null then
    raise exception 'Missing multicompte prerequisites for dashboard onboarding.';
  end if;
end;
$$;

create table if not exists public.inrcy_onboarding_states (
  account_id uuid primary key references public.inrcy_accounts(id) on delete cascade,
  version smallint not null default 1,
  status text not null default 'pending',
  current_step text not null default 'profile',
  started_at timestamptz null,
  completed_at timestamptz null,
  deferred_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inrcy_onboarding_states_version_check check (version >= 1),
  constraint inrcy_onboarding_states_status_check
    check (status in ('pending', 'in_progress', 'deferred', 'completed')),
  constraint inrcy_onboarding_states_step_check
    check (current_step in ('profile', 'activity', 'ai', 'completed')),
  constraint inrcy_onboarding_states_consistency_check
    check (
      (status = 'completed' and current_step = 'completed' and completed_at is not null)
      or
      (status <> 'completed' and current_step <> 'completed' and completed_at is null)
    )
);

comment on table public.inrcy_onboarding_states is
  'Dashboard onboarding progress stored independently for each iNrCy business account.';
comment on column public.inrcy_onboarding_states.current_step is
  'Current guided step: profile, activity, ai, or completed.';
comment on column public.inrcy_onboarding_states.version is
  'Allows a future onboarding revision without mixing it with version 1.';

drop trigger if exists inrcy_onboarding_states_touch_updated_at
  on public.inrcy_onboarding_states;
create trigger inrcy_onboarding_states_touch_updated_at
before update on public.inrcy_onboarding_states
for each row execute function public.inrcy_touch_updated_at();

-- Do not disturb accounts that already existed when onboarding was introduced.
insert into public.inrcy_onboarding_states (
  account_id,
  version,
  status,
  current_step,
  started_at,
  completed_at
)
select
  a.id,
  1,
  'completed',
  'completed',
  now(),
  now()
from public.inrcy_accounts a
on conflict (account_id) do nothing;

-- Every future auth account or secondary establishment receives a fresh state.
create or replace function public.inrcy_provision_onboarding_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.inrcy_onboarding_states (
    account_id,
    version,
    status,
    current_step
  )
  values (new.id, 1, 'pending', 'profile')
  on conflict (account_id) do nothing;

  return new;
end;
$$;

revoke all on function public.inrcy_provision_onboarding_state() from public;

drop trigger if exists inrcy_provision_onboarding_state_after_insert
  on public.inrcy_accounts;
create trigger inrcy_provision_onboarding_state_after_insert
after insert on public.inrcy_accounts
for each row execute function public.inrcy_provision_onboarding_state();

-- The client only reads the row directly. Mutations pass through the guarded RPC.
revoke all on public.inrcy_onboarding_states from anon, authenticated;
grant select on public.inrcy_onboarding_states to authenticated;
grant all on public.inrcy_onboarding_states to service_role;

alter table public.inrcy_onboarding_states enable row level security;

drop policy if exists inrcy_onboarding_states_select_accessible
  on public.inrcy_onboarding_states;
create policy inrcy_onboarding_states_select_accessible
on public.inrcy_onboarding_states
for select
to authenticated
using (public.inrcy_can_access_account(account_id));

create or replace function public.inrcy_save_onboarding_state(
  p_account_id uuid,
  p_status text,
  p_current_step text,
  p_version smallint default 1
)
returns public.inrcy_onboarding_states
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.inrcy_onboarding_states%rowtype;
  v_saved public.inrcy_onboarding_states%rowtype;
begin
  if auth.uid() is null then
    raise exception 'INRCY_AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if p_account_id is null or not public.inrcy_can_access_account(p_account_id) then
    raise exception 'INRCY_ACCOUNT_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  if p_version is null or p_version < 1 then
    raise exception 'INRCY_ONBOARDING_VERSION_INVALID' using errcode = 'P0001';
  end if;

  if p_status not in ('pending', 'in_progress', 'deferred', 'completed') then
    raise exception 'INRCY_ONBOARDING_STATUS_INVALID' using errcode = 'P0001';
  end if;

  if p_current_step not in ('profile', 'activity', 'ai', 'completed') then
    raise exception 'INRCY_ONBOARDING_STEP_INVALID' using errcode = 'P0001';
  end if;

  if (p_status = 'completed') <> (p_current_step = 'completed') then
    raise exception 'INRCY_ONBOARDING_STATE_INCONSISTENT' using errcode = 'P0001';
  end if;

  select *
    into v_existing
  from public.inrcy_onboarding_states s
  where s.account_id = p_account_id
  for update;

  if not found then
    raise exception 'INRCY_ONBOARDING_STATE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_version < v_existing.version then
    raise exception 'INRCY_ONBOARDING_VERSION_STALE' using errcode = 'P0001';
  end if;

  -- A completed version cannot be reopened accidentally by the browser.
  if v_existing.status = 'completed' and p_version = v_existing.version
     and p_status <> 'completed' then
    raise exception 'INRCY_ONBOARDING_ALREADY_COMPLETED' using errcode = 'P0001';
  end if;

  update public.inrcy_onboarding_states
  set
    version = p_version,
    status = p_status,
    current_step = p_current_step,
    started_at = case
      when p_status in ('in_progress', 'deferred', 'completed')
        then coalesce(started_at, now())
      else started_at
    end,
    deferred_at = case
      when p_status = 'deferred' then now()
      when p_status in ('in_progress', 'completed') then null
      else deferred_at
    end,
    completed_at = case
      when p_status = 'completed' then coalesce(completed_at, now())
      else null
    end
  where account_id = p_account_id
  returning * into v_saved;

  return v_saved;
end;
$$;

revoke all on function public.inrcy_save_onboarding_state(uuid, text, text, smallint)
  from public;
grant execute on function public.inrcy_save_onboarding_state(uuid, text, text, smallint)
  to authenticated;

commit;
