-- iNr'Send - Etape 1 : verrou distribue par boite mail
-- A executer une fois dans Supabase avant le deploiement du code.

create table if not exists public.mail_campaign_dispatch_locks (
  integration_id uuid primary key,
  owner_token text not null,
  locked_until timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists mail_campaign_dispatch_locks_expiry_idx
  on public.mail_campaign_dispatch_locks (locked_until);

alter table public.mail_campaign_dispatch_locks enable row level security;

create or replace function public.try_acquire_mail_campaign_mailbox_lock(
  p_integration_id uuid,
  p_owner_token text,
  p_lease_seconds integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_lease interval := make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 180), 900)));
begin
  if p_integration_id is null or coalesce(btrim(p_owner_token), '') = '' then
    return false;
  end if;

  insert into public.mail_campaign_dispatch_locks (
    integration_id,
    owner_token,
    locked_until,
    updated_at
  )
  values (
    p_integration_id,
    p_owner_token,
    v_now + v_lease,
    v_now
  )
  on conflict (integration_id) do update
  set owner_token = excluded.owner_token,
      locked_until = excluded.locked_until,
      updated_at = excluded.updated_at
  where public.mail_campaign_dispatch_locks.locked_until <= v_now
     or public.mail_campaign_dispatch_locks.owner_token = excluded.owner_token;

  return exists (
    select 1
    from public.mail_campaign_dispatch_locks
    where integration_id = p_integration_id
      and owner_token = p_owner_token
      and locked_until > v_now
  );
end;
$$;

create or replace function public.renew_mail_campaign_mailbox_lock(
  p_integration_id uuid,
  p_owner_token text,
  p_lease_seconds integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_lease interval := make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 180), 900)));
begin
  update public.mail_campaign_dispatch_locks
  set locked_until = v_now + v_lease,
      updated_at = v_now
  where integration_id = p_integration_id
    and owner_token = p_owner_token
    and locked_until > v_now;

  return found;
end;
$$;

create or replace function public.release_mail_campaign_mailbox_lock(
  p_integration_id uuid,
  p_owner_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.mail_campaign_dispatch_locks
  where integration_id = p_integration_id
    and owner_token = p_owner_token;

  return found;
end;
$$;

revoke all on table public.mail_campaign_dispatch_locks from public, anon, authenticated;
revoke all on function public.try_acquire_mail_campaign_mailbox_lock(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.renew_mail_campaign_mailbox_lock(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.release_mail_campaign_mailbox_lock(uuid, text) from public, anon, authenticated;

grant all on table public.mail_campaign_dispatch_locks to service_role;
grant execute on function public.try_acquire_mail_campaign_mailbox_lock(uuid, text, integer) to service_role;
grant execute on function public.renew_mail_campaign_mailbox_lock(uuid, text, integer) to service_role;
grant execute on function public.release_mail_campaign_mailbox_lock(uuid, text) to service_role;
