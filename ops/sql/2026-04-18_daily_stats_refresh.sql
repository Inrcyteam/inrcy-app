-- iNrCy — first login of the day stats refresh
-- Run this in Supabase SQL Editor before deploying the app changes.

begin;

create table if not exists public.user_daily_stats_refresh (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_started_snapshot_date date,
  last_started_at timestamptz,
  last_completed_snapshot_date date,
  last_completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_daily_stats_refresh enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_daily_stats_refresh'
      and policyname = 'user_daily_stats_refresh_select_own'
  ) then
    create policy "user_daily_stats_refresh_select_own"
    on public.user_daily_stats_refresh
    for select
    using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_daily_stats_refresh'
      and policyname = 'user_daily_stats_refresh_insert_own'
  ) then
    create policy "user_daily_stats_refresh_insert_own"
    on public.user_daily_stats_refresh
    for insert
    with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_daily_stats_refresh'
      and policyname = 'user_daily_stats_refresh_update_own'
  ) then
    create policy "user_daily_stats_refresh_update_own"
    on public.user_daily_stats_refresh
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.claim_daily_stats_refresh(
  p_snapshot_date date,
  p_lease_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_claimed boolean := false;
begin
  if v_user_id is null or p_snapshot_date is null then
    return false;
  end if;

  insert into public.user_daily_stats_refresh as t (
    user_id,
    last_started_snapshot_date,
    last_started_at,
    updated_at
  )
  values (
    v_user_id,
    p_snapshot_date,
    v_now,
    v_now
  )
  on conflict (user_id) do update
  set
    last_started_snapshot_date = excluded.last_started_snapshot_date,
    last_started_at = excluded.last_started_at,
    updated_at = excluded.updated_at
  where t.last_completed_snapshot_date is distinct from excluded.last_started_snapshot_date
    and (
      t.last_started_snapshot_date is distinct from excluded.last_started_snapshot_date
      or t.last_started_at is null
      or t.last_started_at < (v_now - make_interval(secs => greatest(coalesce(p_lease_seconds, 900), 60)))
    )
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.complete_daily_stats_refresh(
  p_snapshot_date date
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_done boolean := false;
begin
  if v_user_id is null or p_snapshot_date is null then
    return false;
  end if;

  insert into public.user_daily_stats_refresh as t (
    user_id,
    last_started_snapshot_date,
    last_started_at,
    last_completed_snapshot_date,
    last_completed_at,
    updated_at
  )
  values (
    v_user_id,
    p_snapshot_date,
    v_now,
    p_snapshot_date,
    v_now,
    v_now
  )
  on conflict (user_id) do update
  set
    last_completed_snapshot_date = excluded.last_completed_snapshot_date,
    last_completed_at = excluded.last_completed_at,
    updated_at = excluded.updated_at,
    last_started_snapshot_date = coalesce(t.last_started_snapshot_date, excluded.last_started_snapshot_date),
    last_started_at = coalesce(t.last_started_at, excluded.last_started_at)
  returning true into v_done;

  return coalesce(v_done, false);
end;
$$;

create or replace function public.release_daily_stats_refresh_claim(
  p_snapshot_date date
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_released boolean := false;
begin
  if v_user_id is null or p_snapshot_date is null then
    return false;
  end if;

  update public.user_daily_stats_refresh
  set
    last_started_snapshot_date = null,
    last_started_at = null,
    updated_at = now()
  where user_id = v_user_id
    and last_started_snapshot_date = p_snapshot_date
    and (last_completed_snapshot_date is distinct from p_snapshot_date)
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;

grant execute on function public.claim_daily_stats_refresh(date, integer) to authenticated;
grant execute on function public.complete_daily_stats_refresh(date) to authenticated;
grant execute on function public.release_daily_stats_refresh_claim(date) to authenticated;

commit;
