-- iNrSend — classement fiable des brouillons par rubrique
-- À exécuter si Supabase refuse l'enregistrement avancé des brouillons
-- ou si les brouillons Fidéliser / Propulser / Publications restent classés dans Mails.

alter table public.send_items
  add column if not exists folder text,
  add column if not exists track_kind text,
  add column if not exists track_type text,
  add column if not exists template_key text,
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Si une ancienne contrainte CHECK sur folder bloque les nouvelles catégories,
-- on la remplace par une contrainte compatible avec toute la navigation iNrSend.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'send_items'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%folder%'
  loop
    execute format('alter table public.send_items drop constraint if exists %I', constraint_row.conname);
  end loop;
end $$;

alter table public.send_items
  add constraint send_items_folder_check
  check (
    folder is null or folder in (
      'mails',
      'factures',
      'devis',
      'publications',
      'recoltes',
      'offres',
      'informations',
      'suivis',
      'enquetes',
      'propulsions',
      'fidelisations'
    )
  );

create index if not exists send_items_user_folder_status_created_idx
  on public.send_items (user_id, folder, status, created_at desc);

create index if not exists send_items_user_track_created_idx
  on public.send_items (user_id, track_kind, track_type, created_at desc);

update public.send_items
set folder = case
  when type = 'facture' then 'factures'
  when type = 'devis' then 'devis'
  else 'mails'
end
where folder is null;
