-- iNrCy multicompte — Étape 6
-- Durcissement final et réparation idempotente avant mise en production.
-- Pré-requis : étapes 1 à 5 appliquées.
-- Aucun user_id métier existant n'est réécrit.

begin;

do $$
begin
  if to_regclass('public.inrcy_accounts') is null
     or to_regclass('public.inrcy_account_members') is null
     or to_regclass('public.inrcy_multi_account_config') is null
     or to_regprocedure('public.inrcy_create_establishment(text)') is null
     or to_regprocedure('public.inrcy_can_access_account(uuid)') is null then
    raise exception 'Pré-requis multicompte incomplets : appliquer les étapes 1 à 5 avant l''étape 6.';
  end if;
end;
$$;

-- 1) Répare uniquement les lignes de socle manquantes des comptes AUTH historiques.
-- L'UUID principal reste strictement identique à auth.users.id.
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

-- Insère le membership principal manquant. Il devient défaut uniquement si le compte AUTH
-- n'a encore aucun établissement par défaut, pour respecter l'index unique existant.
insert into public.inrcy_account_members (auth_user_id, account_id, role, is_default)
select
  u.id,
  u.id,
  'owner',
  not exists (
    select 1
    from public.inrcy_account_members d
    where d.auth_user_id = u.id
      and d.is_default
  )
from auth.users u
join public.inrcy_accounts a on a.id = u.id
where not exists (
  select 1
  from public.inrcy_account_members m
  where m.auth_user_id = u.id
    and m.account_id = u.id
)
on conflict (auth_user_id, account_id) do nothing;

-- Si un établissement orphelin a encore un créateur AUTH valide, restaure son accès owner.
insert into public.inrcy_account_members (auth_user_id, account_id, role, is_default)
select
  a.created_by_auth_user_id,
  a.id,
  'owner',
  false
from public.inrcy_accounts a
where a.created_by_auth_user_id is not null
  and exists (select 1 from auth.users u where u.id = a.created_by_auth_user_id)
  and not exists (
    select 1 from public.inrcy_account_members m where m.account_id = a.id
  )
on conflict (auth_user_id, account_id) do nothing;

insert into public.inrcy_multi_account_config (
  auth_user_id,
  multi_account_enabled,
  max_establishments
)
select u.id, false, 1
from auth.users u
on conflict (auth_user_id) do nothing;

-- Tous les établissements doivent posséder leur profil métier indépendant.
insert into public.profiles (user_id, updated_at)
select a.id, now()
from public.inrcy_accounts a
left join public.profiles p on p.user_id = a.id
where p.user_id is null
on conflict (user_id) do nothing;

-- 2) Rend la configuration cohérente avec le nombre déjà créé, sans activer le multicompte.
-- On ne supprime jamais un établissement et on ne réduit jamais un quota ici.
with counts as (
  select auth_user_id, count(*)::integer as account_count
  from public.inrcy_account_members
  group by auth_user_id
)
update public.inrcy_multi_account_config c
set
  max_establishments = greatest(c.max_establishments, counts.account_count, 1),
  updated_at = case
    when c.max_establishments < greatest(counts.account_count, 1) then now()
    else c.updated_at
  end
from counts
where counts.auth_user_id = c.auth_user_id
  and c.max_establishments < greatest(counts.account_count, 1);

-- 3) Garantit qu'un compte AUTH sans défaut récupère son principal comme défaut.
update public.inrcy_account_members principal
set is_default = true,
    updated_at = now()
where principal.auth_user_id = principal.account_id
  and not exists (
    select 1
    from public.inrcy_account_members d
    where d.auth_user_id = principal.auth_user_id
      and d.is_default
  );

commit;
