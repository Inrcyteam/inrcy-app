-- iNrCy multicompte — Étape 2
-- Bascule non destructive des données métier de l'identité AUTH vers l'établissement iNrCy.
-- Pré-requis : exécuter d'abord 2026-07-05_multicompte_step1_foundation.sql.
--
-- Principes :
--   * public.subscriptions reste volontairement rattachée à auth.users : l'abonnement est commun au compte général.
--   * les autres FK public.<table>.user_id -> auth.users(id) deviennent
--     public.<table>.user_id -> public.inrcy_accounts(id).
--   * les RLS simples "auth.uid() = user_id" deviennent un contrôle d'appartenance à l'établissement.
--   * les chemins Storage historiques restent compatibles car, pour le compte principal,
--     account_id = auth.uid().
--
-- Cette migration ne déplace ni ne réécrit aucune ligne métier existante.

begin;

-- Verrou de précondition : on refuse une exécution partielle si l'étape 1 n'est pas présente.
do $$
begin
  if to_regclass('public.inrcy_accounts') is null
     or to_regclass('public.inrcy_account_members') is null
     or to_regprocedure('public.inrcy_can_access_account(uuid)') is null then
    raise exception
      'Pré-requis multicompte étape 1 absent : exécuter 2026-07-05_multicompte_step1_foundation.sql avant l''étape 2.';
  end if;
end;
$$;

-- Conversion sûre d'un segment de chemin Storage vers UUID.
-- Un objet dont le chemin ne contient pas d'UUID valide est simplement refusé par la RLS.
create or replace function public.inrcy_try_uuid(p_value text)
returns uuid
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
begin
  return p_value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

revoke all on function public.inrcy_try_uuid(text) from public;
grant execute on function public.inrcy_try_uuid(text) to authenticated;

create or replace function public.inrcy_can_access_account_text(p_account_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.inrcy_can_access_account(public.inrcy_try_uuid(p_account_id)),
    false
  );
$$;

revoke all on function public.inrcy_can_access_account_text(text) from public;
grant execute on function public.inrcy_can_access_account_text(text) to authenticated;

-- Garde-fou avant changement de FK : chaque user_id métier historique doit déjà avoir son compte iNrCy.
do $$
declare
  fk record;
  v_missing bigint;
begin
  -- Le contrôle est construit dynamiquement table par table pour éviter toute supposition de schéma.
  for fk in
    select t.relname as table_name
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
      and t.relname <> 'subscriptions'
    order by t.relname
  loop
    execute format(
      'select count(*) from %I.%I x left join public.inrcy_accounts a on a.id = x.user_id where x.user_id is not null and a.id is null',
      'public', fk.table_name
    ) into v_missing;

    if v_missing > 0 then
      raise exception
        'Migration multicompte bloquée : %.% contient % user_id sans compte iNrCy correspondant.',
        'public', fk.table_name, v_missing;
    end if;
  end loop;
end;
$$;

-- 1) Repointage automatique et conservateur des FK métier.
-- On conserve le nom de contrainte, les règles ON DELETE / ON UPDATE et la déférabilité.
-- subscriptions est explicitement exclue : elle reste au niveau AUTH général.
do $$
declare
  fk record;
  v_definition text;
begin
  for fk in
    select
      c.oid,
      c.conname,
      n.nspname as schema_name,
      t.relname as table_name,
      pg_get_constraintdef(c.oid, true) as constraint_definition
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
      and t.relname <> 'subscriptions'
    order by t.relname, c.conname
  loop
    v_definition := regexp_replace(
      fk.constraint_definition,
      'REFERENCES[[:space:]]+auth[.]users[[:space:]]*[(]id[)]',
      'REFERENCES public.inrcy_accounts(id)',
      'i'
    );

    if v_definition = fk.constraint_definition then
      raise exception
        'Impossible de réécrire proprement la FK %.% / % : %',
        fk.schema_name, fk.table_name, fk.conname, fk.constraint_definition;
    end if;

    execute format(
      'alter table %I.%I drop constraint %I',
      fk.schema_name, fk.table_name, fk.conname
    );

    execute format(
      'alter table %I.%I add constraint %I %s not valid',
      fk.schema_name, fk.table_name, fk.conname, v_definition
    );

    execute format(
      'alter table %I.%I validate constraint %I',
      fk.schema_name, fk.table_name, fk.conname
    );
  end loop;
end;
$$;

-- 2) Bascule des policies RLS métier simples.
-- On ne touche qu'aux tables public possédant un user_id UUID et hors abonnement AUTH.
-- Les clauses complexes sont conservées ; seules les comparaisons directes avec auth.uid() sont remplacées.
do $$
declare
  p record;
  v_using text;
  v_check text;
  v_sql text;
begin
  for p in
    select
      pol.schemaname,
      pol.tablename,
      pol.policyname,
      pol.qual,
      pol.with_check
    from pg_policies pol
    join pg_class t
      on t.relname = pol.tablename
    join pg_namespace n
      on n.oid = t.relnamespace
     and n.nspname = pol.schemaname
    join pg_attribute a
      on a.attrelid = t.oid
     and a.attname = 'user_id'
     and not a.attisdropped
    where pol.schemaname = 'public'
      and pol.tablename <> 'subscriptions'
      and a.atttypid = 'uuid'::regtype
      and (
        coalesce(pol.qual, '') ~* 'auth[.]uid[(][)][[:space:]]*=[[:space:]]*([a-zA-Z_][a-zA-Z0-9_]*[.])?user_id'
        or coalesce(pol.qual, '') ~* '([a-zA-Z_][a-zA-Z0-9_]*[.])?user_id[[:space:]]*=[[:space:]]*auth[.]uid[(][)]'
        or coalesce(pol.with_check, '') ~* 'auth[.]uid[(][)][[:space:]]*=[[:space:]]*([a-zA-Z_][a-zA-Z0-9_]*[.])?user_id'
        or coalesce(pol.with_check, '') ~* '([a-zA-Z_][a-zA-Z0-9_]*[.])?user_id[[:space:]]*=[[:space:]]*auth[.]uid[(][)]'
      )
    order by pol.tablename, pol.policyname
  loop
    v_using := p.qual;
    v_check := p.with_check;

    if v_using is not null then
      v_using := regexp_replace(
        v_using,
        'auth[.]uid[(][)][[:space:]]*=[[:space:]]*([a-zA-Z_][a-zA-Z0-9_]*[.])?user_id',
        'public.inrcy_can_access_account(user_id)',
        'gi'
      );
      v_using := regexp_replace(
        v_using,
        '([a-zA-Z_][a-zA-Z0-9_]*[.])?user_id[[:space:]]*=[[:space:]]*auth[.]uid[(][)]',
        'public.inrcy_can_access_account(user_id)',
        'gi'
      );
    end if;

    if v_check is not null then
      v_check := regexp_replace(
        v_check,
        'auth[.]uid[(][)][[:space:]]*=[[:space:]]*([a-zA-Z_][a-zA-Z0-9_]*[.])?user_id',
        'public.inrcy_can_access_account(user_id)',
        'gi'
      );
      v_check := regexp_replace(
        v_check,
        '([a-zA-Z_][a-zA-Z0-9_]*[.])?user_id[[:space:]]*=[[:space:]]*auth[.]uid[(][)]',
        'public.inrcy_can_access_account(user_id)',
        'gi'
      );
    end if;

    v_sql := format(
      'alter policy %I on %I.%I',
      p.policyname, p.schemaname, p.tablename
    );

    if v_using is not null then
      v_sql := v_sql || format(' using (%s)', v_using);
    end if;

    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;

    execute v_sql;
  end loop;
end;
$$;

-- 3) Storage : adaptation explicite des deux espaces privés actuellement structurés par user_id.
-- Les noms de policy existants sont conservés pour rendre la migration idempotente et lisible.
--
-- Médiathèque : users/<account_id>/...
drop policy if exists "inrcy_pro_media_select_own" on storage.objects;
create policy "inrcy_pro_media_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'inrcy-pro-media'
    and (storage.foldername(name))[1] = 'users'
    and public.inrcy_can_access_account_text((storage.foldername(name))[2])
  );

drop policy if exists "inrcy_pro_media_insert_own" on storage.objects;
create policy "inrcy_pro_media_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'inrcy-pro-media'
    and (storage.foldername(name))[1] = 'users'
    and public.inrcy_can_access_account_text((storage.foldername(name))[2])
  );

drop policy if exists "inrcy_pro_media_update_own" on storage.objects;
create policy "inrcy_pro_media_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'inrcy-pro-media'
    and (storage.foldername(name))[1] = 'users'
    and public.inrcy_can_access_account_text((storage.foldername(name))[2])
  )
  with check (
    bucket_id = 'inrcy-pro-media'
    and (storage.foldername(name))[1] = 'users'
    and public.inrcy_can_access_account_text((storage.foldername(name))[2])
  );

drop policy if exists "inrcy_pro_media_delete_own" on storage.objects;
create policy "inrcy_pro_media_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'inrcy-pro-media'
    and (storage.foldername(name))[1] = 'users'
    and public.inrcy_can_access_account_text((storage.foldername(name))[2])
  );

-- iNrSend : <account_id>/mail-attachments|factures|devis/...
drop policy if exists "inrbox_attachments_select_own" on storage.objects;
create policy "inrbox_attachments_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'inrbox_attachments'
    and public.inrcy_can_access_account_text((storage.foldername(name))[1])
  );

drop policy if exists "inrbox_attachments_insert_own" on storage.objects;
create policy "inrbox_attachments_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'inrbox_attachments'
    and public.inrcy_can_access_account_text((storage.foldername(name))[1])
  );

drop policy if exists "inrbox_attachments_update_own" on storage.objects;
create policy "inrbox_attachments_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'inrbox_attachments'
    and public.inrcy_can_access_account_text((storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'inrbox_attachments'
    and public.inrcy_can_access_account_text((storage.foldername(name))[1])
  );

drop policy if exists "inrbox_attachments_delete_own" on storage.objects;
create policy "inrbox_attachments_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'inrbox_attachments'
    and public.inrcy_can_access_account_text((storage.foldername(name))[1])
  );

-- 4) Garde-fou final : aucune FK métier user_id ne doit encore viser auth.users.
-- subscriptions est la seule exception volontaire à ce stade.
do $$
declare
  v_remaining bigint;
begin
  select count(*)
  into v_remaining
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

  if v_remaining <> 0 then
    raise exception
      'Migration multicompte incomplète : % FK métier user_id pointent encore vers auth.users.',
      v_remaining;
  end if;
end;
$$;

commit;
