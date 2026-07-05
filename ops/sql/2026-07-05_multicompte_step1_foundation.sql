-- iNrCy multicompte — Étape 1
-- Socle non destructif : séparation future entre l'identité AUTH et le user_id métier actif.
-- Cette migration ne déplace aucune donnée métier existante et ne modifie aucune RLS existante.

begin;

create table if not exists public.inrcy_accounts (
  id uuid primary key,
  display_name text not null,
  created_by_auth_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inrcy_accounts_display_name_not_blank check (length(btrim(display_name)) > 0)
);

comment on table public.inrcy_accounts is
  'Comptes métier / établissements iNrCy. L''id devient la cible future des colonnes user_id métier.';
comment on column public.inrcy_accounts.id is
  'UUID métier de l''établissement. Pour les comptes historiques, il est identique au auth.users.id actuel afin de préserver toutes les données.';

create table if not exists public.inrcy_account_members (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.inrcy_accounts(id) on delete cascade,
  role text not null default 'owner',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (auth_user_id, account_id),
  constraint inrcy_account_members_role_check check (role in ('owner', 'admin', 'member'))
);

comment on table public.inrcy_account_members is
  'Liaison entre un compte Supabase AUTH et les établissements iNrCy auxquels il peut accéder.';

create table if not exists public.inrcy_multi_account_config (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  multi_account_enabled boolean not null default false,
  max_establishments integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inrcy_multi_account_config_max_check check (max_establishments >= 1)
);

comment on table public.inrcy_multi_account_config is
  'Configuration commerciale multicompte pilotée par iNrCy : activation et nombre maximum d''établissements autorisés.';

create index if not exists inrcy_account_members_account_id_idx
  on public.inrcy_account_members(account_id);

create index if not exists inrcy_accounts_created_by_auth_user_id_idx
  on public.inrcy_accounts(created_by_auth_user_id);

create unique index if not exists inrcy_account_members_one_default_per_auth_idx
  on public.inrcy_account_members(auth_user_id)
  where is_default;

create or replace function public.inrcy_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.inrcy_touch_updated_at() from public;


drop trigger if exists inrcy_accounts_touch_updated_at on public.inrcy_accounts;
create trigger inrcy_accounts_touch_updated_at
before update on public.inrcy_accounts
for each row execute function public.inrcy_touch_updated_at();

drop trigger if exists inrcy_account_members_touch_updated_at on public.inrcy_account_members;
create trigger inrcy_account_members_touch_updated_at
before update on public.inrcy_account_members
for each row execute function public.inrcy_touch_updated_at();

drop trigger if exists inrcy_multi_account_config_touch_updated_at on public.inrcy_multi_account_config;
create trigger inrcy_multi_account_config_touch_updated_at
before update on public.inrcy_multi_account_config
for each row execute function public.inrcy_touch_updated_at();

-- Backfill non destructif des comptes historiques.
-- Règle de compatibilité : account_id = auth.users.id actuel.
-- Le nom privilégie profiles.company_legal_name, puis le nom/prénom, puis l'email AUTH.
insert into public.inrcy_accounts (id, display_name, created_by_auth_user_id)
select
  u.id,
  coalesce(
    nullif(btrim(p.company_legal_name), ''),
    nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.email), ''),
    'Établissement principal'
  ) as display_name,
  u.id
from auth.users u
left join lateral (
  select pr.company_legal_name, pr.first_name, pr.last_name
  from public.profiles pr
  where pr.user_id = u.id
  limit 1
) p on true
on conflict (id) do nothing;

-- Chaque utilisateur historique accède à son établissement historique, qui reste son établissement par défaut.
insert into public.inrcy_account_members (auth_user_id, account_id, role, is_default)
select u.id, u.id, 'owner', true
from auth.users u
join public.inrcy_accounts a on a.id = u.id
on conflict (auth_user_id, account_id) do nothing;

-- Tous les utilisateurs restent mono-établissement par défaut.
insert into public.inrcy_multi_account_config (
  auth_user_id,
  multi_account_enabled,
  max_establishments
)
select u.id, false, 1
from auth.users u
on conflict (auth_user_id) do nothing;

-- Fonction centrale de lecture d'accès. Elle servira aux RLS de l'étape 2.
create or replace function public.inrcy_can_access_account(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.inrcy_account_members m
    where m.auth_user_id = auth.uid()
      and m.account_id = p_account_id
  );
$$;

revoke all on function public.inrcy_can_access_account(uuid) from public;
grant execute on function public.inrcy_can_access_account(uuid) to authenticated;

-- Lecture côté client uniquement. Les créations/modifications restent réservées au backend service-role / Admin iNrCy.
revoke all on public.inrcy_accounts from anon, authenticated;
revoke all on public.inrcy_account_members from anon, authenticated;
revoke all on public.inrcy_multi_account_config from anon, authenticated;

grant select on public.inrcy_accounts to authenticated;
grant select on public.inrcy_account_members to authenticated;
grant select on public.inrcy_multi_account_config to authenticated;

grant all on public.inrcy_accounts to service_role;
grant all on public.inrcy_account_members to service_role;
grant all on public.inrcy_multi_account_config to service_role;

alter table public.inrcy_accounts enable row level security;
alter table public.inrcy_account_members enable row level security;
alter table public.inrcy_multi_account_config enable row level security;

drop policy if exists inrcy_accounts_select_accessible on public.inrcy_accounts;
create policy inrcy_accounts_select_accessible
on public.inrcy_accounts
for select
to authenticated
using (public.inrcy_can_access_account(id));

drop policy if exists inrcy_account_members_select_self on public.inrcy_account_members;
create policy inrcy_account_members_select_self
on public.inrcy_account_members
for select
to authenticated
using (auth_user_id = auth.uid());

drop policy if exists inrcy_multi_account_config_select_self on public.inrcy_multi_account_config;
create policy inrcy_multi_account_config_select_self
on public.inrcy_multi_account_config
for select
to authenticated
using (auth_user_id = auth.uid());

commit;
