-- iNrCy - Pinterest Standard approuve : activation globale Bubble Access.
-- Idempotent et cible uniquement Pinterest.
-- IMPORTANT : ne pas faire un UPDATE global de tous les enabled=false,
-- car Site iNrCy doit rester un droit opt-in gere separement.

begin;

-- 1) Tous les comptes existants possedent Pinterest et passent a true.
insert into public.app_bubble_access (user_id, bubble_key, enabled)
select account.id, 'pinterest', true
from public.inrcy_accounts account
on conflict (user_id, bubble_key) do update
set enabled = true;

-- 2) Tous les futurs comptes recoivent Pinterest=true des leur creation.
-- Cette fonction remplace la version precedente qui conservait Pinterest=false
-- pendant la phase Trial, sans modifier la regle Site iNrCy=false.
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
    (new.id, 'pinterest', true),
    (new.id, 'tiktok', true),
    (new.id, 'inr_agent', true)
  on conflict (user_id, bubble_key) do update
  set enabled = excluded.enabled;

  return new;
end;
$$;

revoke all on function public.inrcy_seed_new_account_bubble_access() from public, anon, authenticated;

-- Repose le trigger canonique au cas ou il aurait ete supprime ou remplace.
drop trigger if exists zzzz_inrcy_seed_new_account_bubble_access on public.inrcy_accounts;
create trigger zzzz_inrcy_seed_new_account_bubble_access
after insert on public.inrcy_accounts
for each row execute function public.inrcy_seed_new_account_bubble_access();

commit;

-- Controle : ces deux compteurs doivent retourner 0.
-- select count(*) as pinterest_absent
-- from public.inrcy_accounts account
-- left join public.app_bubble_access access
--   on access.user_id = account.id
--  and access.bubble_key = 'pinterest'
-- where access.user_id is null;
--
-- select count(*) as pinterest_encore_desactive
-- from public.app_bubble_access
-- where bubble_key = 'pinterest'
--   and enabled is not true;
