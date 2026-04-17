-- iNrCy — profile version counters + realtime bridge
-- Run this in Supabase SQL Editor on PRODUCTION.

begin;

alter table if exists public.profiles add column if not exists stats_version bigint not null default 0;
alter table if exists public.profiles add column if not exists notifications_version bigint not null default 0;
alter table if exists public.profiles add column if not exists docs_version bigint not null default 0;
alter table if exists public.profiles add column if not exists loyalty_version bigint not null default 0;
alter table if exists public.profiles add column if not exists publications_version bigint not null default 0;

create or replace function public.bump_profile_version(p_user_id uuid, p_column text)
returns void
language plpgsql
security definer
set search_path = public
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
    'publications_version'
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

create or replace function public.bump_profile_version_from_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id_text text;
  v_user_id uuid;
  v_column text;
begin
  v_column := tg_argv[0];
  if tg_op = 'DELETE' then
    v_user_id_text := coalesce(to_jsonb(old) ->> 'user_id', '');
  else
    v_user_id_text := coalesce(to_jsonb(new) ->> 'user_id', to_jsonb(old) ->> 'user_id', '');
  end if;

  if v_user_id_text = '' or v_column = '' then
    return coalesce(new, old);
  end if;

  v_user_id := v_user_id_text::uuid;
  perform public.bump_profile_version(v_user_id, v_column);
  return coalesce(new, old);
exception
  when others then
    return coalesce(new, old);
end;
$$;

create or replace function public.bump_stats_version_from_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if (
    new.lead_conversion_rate is distinct from old.lead_conversion_rate
    or new.avg_basket is distinct from old.avg_basket
    or new.inrcy_site_ownership is distinct from old.inrcy_site_ownership
  ) then
    new.stats_version := coalesce(old.stats_version, 0) + 1;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_bump_stats_version on public.profiles;
create trigger trg_profiles_bump_stats_version
before update on public.profiles
for each row
execute function public.bump_stats_version_from_profiles();

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'notifications') then
    drop trigger if exists trg_notifications_bump_version on public.notifications;
    create trigger trg_notifications_bump_version
    after insert or update or delete on public.notifications
    for each row
    execute function public.bump_profile_version_from_user_id('notifications_version');
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'doc_saves') then
    drop trigger if exists trg_doc_saves_bump_version on public.doc_saves;
    create trigger trg_doc_saves_bump_version
    after insert or update or delete on public.doc_saves
    for each row
    execute function public.bump_profile_version_from_user_id('docs_version');
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'loyalty_balance') then
    drop trigger if exists trg_loyalty_balance_bump_version on public.loyalty_balance;
    create trigger trg_loyalty_balance_bump_version
    after insert or update or delete on public.loyalty_balance
    for each row
    execute function public.bump_profile_version_from_user_id('loyalty_version');
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'publications') then
    drop trigger if exists trg_publications_bump_version on public.publications;
    create trigger trg_publications_bump_version
    after insert or update or delete on public.publications
    for each row
    execute function public.bump_profile_version_from_user_id('publications_version');
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'publication_deliveries') then
    drop trigger if exists trg_publication_deliveries_bump_version on public.publication_deliveries;
    create trigger trg_publication_deliveries_bump_version
    after insert or update or delete on public.publication_deliveries
    for each row
    execute function public.bump_profile_version_from_user_id('publications_version');
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'integrations') then
    drop trigger if exists trg_integrations_bump_stats_version on public.integrations;
    create trigger trg_integrations_bump_stats_version
    after insert or update or delete on public.integrations
    for each row
    execute function public.bump_profile_version_from_user_id('stats_version');
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'inrcy_site_configs') then
    drop trigger if exists trg_inrcy_site_configs_bump_stats_version on public.inrcy_site_configs;
    create trigger trg_inrcy_site_configs_bump_stats_version
    after insert or update or delete on public.inrcy_site_configs
    for each row
    execute function public.bump_profile_version_from_user_id('stats_version');
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'pro_tools_configs') then
    drop trigger if exists trg_pro_tools_configs_bump_stats_version on public.pro_tools_configs;
    create trigger trg_pro_tools_configs_bump_stats_version
    after insert or update or delete on public.pro_tools_configs
    for each row
    execute function public.bump_profile_version_from_user_id('stats_version');
  end if;
end $$;

alter table public.profiles replica identity full;

do $$
begin
  if not exists (
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
