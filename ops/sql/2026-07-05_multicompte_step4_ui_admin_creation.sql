-- iNrCy multicompte — Étape 4
-- Interface établissements + quota Admin + création atomique d'un établissement vierge.
-- Pré-requis : étapes 1 à 3 appliquées.

begin;

-- Provisionne automatiquement le compte historique principal des futurs comptes AUTH.
-- Compatibilité : l'établissement principal garde exactement l'UUID AUTH.
create or replace function public.inrcy_provision_auth_account()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_display_name text;
begin
  v_display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'company_legal_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.email), ''),
    'Établissement principal'
  );

  insert into public.inrcy_accounts (id, display_name, created_by_auth_user_id)
  values (new.id, v_display_name, new.id)
  on conflict (id) do nothing;

  insert into public.inrcy_account_members (auth_user_id, account_id, role, is_default)
  values (new.id, new.id, 'owner', true)
  on conflict (auth_user_id, account_id) do nothing;

  insert into public.inrcy_multi_account_config (
    auth_user_id,
    multi_account_enabled,
    max_establishments
  )
  values (new.id, false, 1)
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.inrcy_provision_auth_account() from public;

drop trigger if exists inrcy_provision_auth_account_after_insert on auth.users;
create trigger inrcy_provision_auth_account_after_insert
after insert on auth.users
for each row execute function public.inrcy_provision_auth_account();

-- Rattrapage idempotent au cas où des utilisateurs auraient été créés entre les étapes 1 et 4.
insert into public.inrcy_accounts (id, display_name, created_by_auth_user_id)
select
  u.id,
  coalesce(
    nullif(btrim(p.company_legal_name), ''),
    nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'company_legal_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.email), ''),
    'Établissement principal'
  ),
  u.id
from auth.users u
left join lateral (
  select pr.company_legal_name, pr.first_name, pr.last_name
  from public.profiles pr
  where pr.user_id = u.id
  limit 1
) p on true
on conflict (id) do nothing;

insert into public.inrcy_account_members (auth_user_id, account_id, role, is_default)
select u.id, u.id, 'owner', true
from auth.users u
join public.inrcy_accounts a on a.id = u.id
on conflict (auth_user_id, account_id) do nothing;

insert into public.inrcy_multi_account_config (
  auth_user_id,
  multi_account_enabled,
  max_establishments
)
select u.id, false, 1
from auth.users u
on conflict (auth_user_id) do nothing;

-- Création atomique : le quota est relu et verrouillé dans la même transaction.
-- Aucun compte AUTH, abonnement ou donnée métier n'est dupliqué.
create or replace function public.inrcy_create_establishment(p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_enabled boolean;
  v_max integer;
  v_current_count integer;
  v_account_id uuid := gen_random_uuid();
  v_display_name text := btrim(coalesce(p_display_name, ''));
begin
  if v_auth_user_id is null then
    raise exception 'INRCY_AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if length(v_display_name) < 2 or length(v_display_name) > 120 then
    raise exception 'INRCY_ESTABLISHMENT_NAME_INVALID' using errcode = 'P0001';
  end if;

  insert into public.inrcy_multi_account_config (
    auth_user_id,
    multi_account_enabled,
    max_establishments
  )
  values (v_auth_user_id, false, 1)
  on conflict (auth_user_id) do nothing;

  select c.multi_account_enabled, c.max_establishments
    into v_enabled, v_max
  from public.inrcy_multi_account_config c
  where c.auth_user_id = v_auth_user_id
  for update;

  if not coalesce(v_enabled, false) then
    raise exception 'INRCY_MULTICOMPTE_DISABLED' using errcode = 'P0001';
  end if;

  select count(*)::integer
    into v_current_count
  from public.inrcy_account_members m
  where m.auth_user_id = v_auth_user_id;

  if v_current_count >= greatest(coalesce(v_max, 1), 1) then
    raise exception 'INRCY_ESTABLISHMENT_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  insert into public.inrcy_accounts (id, display_name, created_by_auth_user_id)
  values (v_account_id, v_display_name, v_auth_user_id);

  insert into public.inrcy_account_members (
    auth_user_id,
    account_id,
    role,
    is_default
  )
  values (v_auth_user_id, v_account_id, 'owner', false);

  return v_account_id;
end;
$$;

revoke all on function public.inrcy_create_establishment(text) from public;
grant execute on function public.inrcy_create_establishment(text) to authenticated;

-- Mise à jour Admin atomique du quota. La même ligne config est verrouillée que lors
-- d'une création utilisateur, ce qui évite de descendre sous un établissement créé en parallèle.
create or replace function public.inrcy_set_multi_account_config(
  p_auth_user_id uuid,
  p_enabled boolean,
  p_max_establishments integer
)
returns table (
  multi_account_enabled boolean,
  max_establishments integer,
  account_count integer
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_count integer;
begin
  if p_auth_user_id is null then
    raise exception 'INRCY_TARGET_AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if p_max_establishments is null or p_max_establishments < 1 or p_max_establishments > 100 then
    raise exception 'INRCY_MAX_ESTABLISHMENTS_INVALID' using errcode = 'P0001';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_auth_user_id) then
    raise exception 'INRCY_TARGET_AUTH_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.inrcy_multi_account_config (
    auth_user_id,
    multi_account_enabled,
    max_establishments
  )
  values (p_auth_user_id, false, 1)
  on conflict (auth_user_id) do nothing;

  perform 1
  from public.inrcy_multi_account_config c
  where c.auth_user_id = p_auth_user_id
  for update;

  select count(*)::integer
    into v_count
  from public.inrcy_account_members m
  where m.auth_user_id = p_auth_user_id;

  v_count := greatest(coalesce(v_count, 0), 1);

  if p_max_establishments < v_count then
    raise exception 'INRCY_MAX_BELOW_ACCOUNT_COUNT:%', v_count using errcode = 'P0001';
  end if;

  update public.inrcy_multi_account_config c
  set
    multi_account_enabled = coalesce(p_enabled, false),
    max_establishments = p_max_establishments,
    updated_at = now()
  where c.auth_user_id = p_auth_user_id;

  return query
  select
    coalesce(p_enabled, false),
    p_max_establishments,
    v_count;
end;
$$;

revoke all on function public.inrcy_set_multi_account_config(uuid, boolean, integer) from public, anon, authenticated;
grant execute on function public.inrcy_set_multi_account_config(uuid, boolean, integer) to service_role;

commit;
