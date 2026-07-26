-- iNrCy - Site iNrCy reste strictement opt-in pour chaque NOUVEAU compte.
-- A executer une seule fois dans Supabase SQL Editor.
--
-- Pourquoi ce trigger central : tous les parcours (invitation publique, creation
-- admin, creation multicompte, creation manuelle) finissent par inserer une ligne
-- dans public.inrcy_accounts. La regle est donc appliquee au bon endroit, une fois.

begin;

create or replace function public.inrcy_seed_new_account_bubble_access()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.app_bubble_access (user_id, bubble_key, enabled)
  values
    (new.id, 'site_inrcy', false),
    (new.id, 'pinterest', false),
    (new.id, 'tiktok', true),
    (new.id, 'inr_agent', true)
  on conflict (user_id, bubble_key) do update
  set enabled = excluded.enabled;

  return new;
end;
$$;

revoke all on function public.inrcy_seed_new_account_bubble_access() from public, anon, authenticated;

-- Le prefixe zzzz fait executer ce trigger apres les autres triggers AFTER INSERT
-- de la table, afin qu'une ancienne initialisation ne puisse pas remettre
-- site_inrcy a true pendant la meme creation de compte.
drop trigger if exists zzzz_inrcy_seed_new_account_bubble_access on public.inrcy_accounts;
create trigger zzzz_inrcy_seed_new_account_bubble_access
after insert on public.inrcy_accounts
for each row execute function public.inrcy_seed_new_account_bubble_access();

-- Completer uniquement les lignes absentes sur les comptes existants.
-- Les activations admin existantes ne sont pas modifiees par ce rattrapage.
insert into public.app_bubble_access (user_id, bubble_key, enabled)
select account.id, defaults.bubble_key, defaults.enabled
from public.inrcy_accounts account
cross join (
  values
    ('site_inrcy'::text, false),
    ('pinterest'::text, false),
    ('tiktok'::text, true),
    ('inr_agent'::text, true)
) as defaults(bubble_key, enabled)
on conflict (user_id, bubble_key) do nothing;

commit;

-- Controle : les futurs comptes doivent avoir site_inrcy=false des leur creation.
-- select a.id, a.display_name, a.created_at, aba.enabled
-- from public.inrcy_accounts a
-- join public.app_bubble_access aba
--   on aba.user_id = a.id and aba.bubble_key = 'site_inrcy'
-- order by a.created_at desc
-- limit 20;
