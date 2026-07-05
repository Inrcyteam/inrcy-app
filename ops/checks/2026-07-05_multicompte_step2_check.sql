-- Contrôle post-déploiement — iNrCy multicompte étape 2
-- Les compteurs "anomalie" doivent être à 0.
-- public.subscriptions reste volontairement au niveau AUTH général.

-- A. FK métier encore liées à auth.users : doit être 0 hors subscriptions.
select count(*) as anomaly_account_fk_still_on_auth_users
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
join pg_attribute a
  on a.attrelid = c.conrelid
 and a.attnum = c.conkey[1]
where c.contype = 'f'
  and n.nspname = 'public'
  and cardinality(c.conkey) = 1
  and a.attname = 'user_id'
  and c.confrelid = 'auth.users'::regclass
  and t.relname <> 'subscriptions';

-- B. Inventaire des FK user_id désormais rattachées aux établissements.
select
  n.nspname as schema_name,
  t.relname as table_name,
  c.conname as constraint_name,
  pg_get_constraintdef(c.oid, true) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
join pg_attribute a
  on a.attrelid = c.conrelid
 and a.attnum = c.conkey[1]
where c.contype = 'f'
  and n.nspname = 'public'
  and cardinality(c.conkey) = 1
  and a.attname = 'user_id'
  and c.confrelid = 'public.inrcy_accounts'::regclass
order by t.relname, c.conname;

-- C. Abonnement général : si la FK existe, elle doit encore viser auth.users.
select
  c.conname as subscription_fk_name,
  pg_get_constraintdef(c.oid, true) as subscription_fk_definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
join pg_attribute a
  on a.attrelid = c.conrelid
 and a.attnum = c.conkey[1]
where c.contype = 'f'
  and n.nspname = 'public'
  and t.relname = 'subscriptions'
  and cardinality(c.conkey) = 1
  and a.attname = 'user_id';

-- D. Données métier orphelines vis-à-vis des établissements : chaque ligne retournée est une anomalie.
do $$
declare
  r record;
  v_missing bigint;
begin
  create temporary table if not exists pg_temp.inrcy_step2_orphans (
    table_name text primary key,
    orphan_count bigint not null
  );

  truncate pg_temp.inrcy_step2_orphans;

  for r in
    select distinct t.relname as table_name
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and n.nspname = 'public'
      and cardinality(c.conkey) = 1
      and a.attname = 'user_id'
      and c.confrelid = 'public.inrcy_accounts'::regclass
    order by t.relname
  loop
    execute format(
      'select count(*) from public.%I x left join public.inrcy_accounts a on a.id = x.user_id where x.user_id is not null and a.id is null',
      r.table_name
    ) into v_missing;

    insert into pg_temp.inrcy_step2_orphans(table_name, orphan_count)
    values (r.table_name, v_missing)
    on conflict (table_name) do update set orphan_count = excluded.orphan_count;
  end loop;
end;
$$;

select table_name, orphan_count
from pg_temp.inrcy_step2_orphans
where orphan_count <> 0
order by table_name;

-- E. Policies public encore basées sur l'égalité directe auth.uid() / user_id : doit être vide hors subscriptions.
select
  schemaname,
  tablename,
  policyname,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename <> 'subscriptions'
  and (
    coalesce(qual, '') ~* 'auth[.]uid[(][)][[:space:]]*=[[:space:]]*([a-zA-Z_][a-zA-Z0-9_]*[.])?user_id'
    or coalesce(qual, '') ~* '([a-zA-Z_][a-zA-Z0-9_]*[.])?user_id[[:space:]]*=[[:space:]]*auth[.]uid[(][)]'
    or coalesce(with_check, '') ~* 'auth[.]uid[(][)][[:space:]]*=[[:space:]]*([a-zA-Z_][a-zA-Z0-9_]*[.])?user_id'
    or coalesce(with_check, '') ~* '([a-zA-Z_][a-zA-Z0-9_]*[.])?user_id[[:space:]]*=[[:space:]]*auth[.]uid[(][)]'
  )
order by tablename, policyname;

-- F. Vérification ciblée Storage : les policies doivent appeler le contrôle d'accès établissement.
select
  schemaname,
  tablename,
  policyname,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname in (
    'inrcy_pro_media_select_own',
    'inrcy_pro_media_insert_own',
    'inrcy_pro_media_update_own',
    'inrcy_pro_media_delete_own',
    'inrbox_attachments_select_own',
    'inrbox_attachments_insert_own',
    'inrbox_attachments_update_own',
    'inrbox_attachments_delete_own'
  )
order by policyname;

-- G. Compatibilité historique : chaque AUTH doit toujours accéder à son compte principal id = auth.uid().
select count(*) as anomaly_historical_auth_without_main_account_access
from auth.users u
left join public.inrcy_account_members m
  on m.auth_user_id = u.id
 and m.account_id = u.id
where m.auth_user_id is null;

-- H. Helpers attendus.
select
  to_regprocedure('public.inrcy_can_access_account(uuid)') is not null as access_uuid_helper_ok,
  to_regprocedure('public.inrcy_try_uuid(text)') is not null as try_uuid_helper_ok,
  to_regprocedure('public.inrcy_can_access_account_text(text)') is not null as access_text_helper_ok;
