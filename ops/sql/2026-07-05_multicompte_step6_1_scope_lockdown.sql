-- iNrCy multicompte — Étape 6.1
-- Correctif de verrouillage du scope établissement actif.
-- Pré-requis : étapes 1 à 6 appliquées.

begin;

do $$
begin
  if to_regclass('public.inrcy_accounts') is null
     or to_regprocedure('public.inrcy_can_access_account(uuid)') is null
     or to_regclass('public.user_daily_stats_refresh') is null then
    raise exception 'Pré-requis multicompte incomplets : appliquer les étapes 1 à 6 avant l''étape 6.1.';
  end if;
end;
$$;

-- 1) Le verrou de refresh des statistiques appartient à l'établissement métier,
-- pas à l'identité AUTH générale.
drop policy if exists "user_daily_stats_refresh_select_own" on public.user_daily_stats_refresh;
drop policy if exists "user_daily_stats_refresh_insert_own" on public.user_daily_stats_refresh;
drop policy if exists "user_daily_stats_refresh_update_own" on public.user_daily_stats_refresh;

create policy "user_daily_stats_refresh_select_own"
on public.user_daily_stats_refresh
for select
to authenticated
using (public.inrcy_can_access_account(user_id));

create policy "user_daily_stats_refresh_insert_own"
on public.user_daily_stats_refresh
for insert
to authenticated
with check (public.inrcy_can_access_account(user_id));

create policy "user_daily_stats_refresh_update_own"
on public.user_daily_stats_refresh
for update
to authenticated
using (public.inrcy_can_access_account(user_id))
with check (public.inrcy_can_access_account(user_id));

-- Supprime les anciennes signatures qui déduisaient implicitement user_id de auth.uid().
drop function if exists public.claim_daily_stats_refresh(date, integer);
drop function if exists public.complete_daily_stats_refresh(date);
drop function if exists public.release_daily_stats_refresh_claim(date);

create or replace function public.claim_daily_stats_refresh(
  p_user_id uuid,
  p_snapshot_date date,
  p_lease_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_claimed boolean := false;
begin
  if p_user_id is null or p_snapshot_date is null then
    return false;
  end if;

  if not public.inrcy_can_access_account(p_user_id) then
    raise exception 'INRCY_ACCOUNT_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  insert into public.user_daily_stats_refresh as t (
    user_id,
    last_started_snapshot_date,
    last_started_at,
    updated_at
  )
  values (
    p_user_id,
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
  p_user_id uuid,
  p_snapshot_date date
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_done boolean := false;
begin
  if p_user_id is null or p_snapshot_date is null then
    return false;
  end if;

  if not public.inrcy_can_access_account(p_user_id) then
    raise exception 'INRCY_ACCOUNT_ACCESS_DENIED' using errcode = 'P0001';
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
    p_user_id,
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
  p_user_id uuid,
  p_snapshot_date date
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_released boolean := false;
begin
  if p_user_id is null or p_snapshot_date is null then
    return false;
  end if;

  if not public.inrcy_can_access_account(p_user_id) then
    raise exception 'INRCY_ACCOUNT_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  update public.user_daily_stats_refresh
  set
    last_started_snapshot_date = null,
    last_started_at = null,
    updated_at = now()
  where user_id = p_user_id
    and last_started_snapshot_date = p_snapshot_date
    and (last_completed_snapshot_date is distinct from p_snapshot_date)
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;

revoke all on function public.claim_daily_stats_refresh(uuid, date, integer) from public, anon;
revoke all on function public.complete_daily_stats_refresh(uuid, date) from public, anon;
revoke all on function public.release_daily_stats_refresh_claim(uuid, date) from public, anon;

grant execute on function public.claim_daily_stats_refresh(uuid, date, integer) to authenticated;
grant execute on function public.complete_daily_stats_refresh(uuid, date) to authenticated;
grant execute on function public.release_daily_stats_refresh_claim(uuid, date) to authenticated;

commit;
