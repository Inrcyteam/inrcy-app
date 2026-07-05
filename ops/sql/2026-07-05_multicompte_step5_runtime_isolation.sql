-- iNrCy multicompte — Étape 5
-- Isolation runtime des établissements + profil vierge atomique à la création.
-- Pré-requis : étapes 1 à 4 appliquées.

begin;

-- Chaque établissement métier possède une ligne profiles indépendante.
-- Les comptes secondaires sont volontairement créés sans recopier les métadonnées AUTH.
insert into public.profiles (user_id, updated_at)
select a.id, now()
from public.inrcy_accounts a
left join public.profiles p on p.user_id = a.id
where p.user_id is null
on conflict (user_id) do nothing;

-- Remplace la RPC Étape 4 : même verrouillage quota, avec création atomique
-- de la ligne profiles vierge du nouvel établissement.
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

  -- Profil strictement vierge : aucun email, nom, société ou donnée métier
  -- du compte AUTH/principal n'est copié dans le nouvel établissement.
  insert into public.profiles (user_id, updated_at)
  values (v_account_id, now())
  on conflict (user_id) do nothing;

  return v_account_id;
end;
$$;

revoke all on function public.inrcy_create_establishment(text) from public;
grant execute on function public.inrcy_create_establishment(text) to authenticated;

commit;
