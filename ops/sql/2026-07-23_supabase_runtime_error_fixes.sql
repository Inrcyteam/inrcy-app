-- iNrCy runtime fixes for the production Supabase logs observed on 2026-07-23.
-- Idempotent: safe to run once in the Supabase SQL editor and again if needed.

begin;

-- The cron reset filters by status + updated_at. Without this index a growing
-- table can make the PATCH exceed the Supabase gateway timeout (522).
create index if not exists idx_inr_agent_scheduled_actions_status_updated_at
  on public.inr_agent_scheduled_actions (status, updated_at);

-- Older installations incorrectly linked inrcy_accounts.id to public.users.id.
-- Account ids are independent UUIDs; only created_by_auth_user_id is an auth
-- ownership reference. Drop only that legacy FK shape, never other FKs.
do $$
declare
  constraint_name text;
  account_id_attnum smallint;
begin
  if to_regclass('public.inrcy_accounts') is not null
     and to_regclass('public.users') is not null then
    select a.attnum
      into account_id_attnum
      from pg_attribute a
     where a.attrelid = 'public.inrcy_accounts'::regclass
       and a.attname = 'id'
       and not a.attisdropped;

    for constraint_name in
      select c.conname
        from pg_constraint c
       where c.conrelid = 'public.inrcy_accounts'::regclass
         and c.contype = 'f'
         and c.confrelid = 'public.users'::regclass
         and c.conkey = array[account_id_attnum]::smallint[]
    loop
      execute format(
        'alter table public.inrcy_accounts drop constraint %I',
        constraint_name
      );
    end loop;
  end if;
end $$;

commit;
