-- Raccourcis mobiles iNrCy : configuration distincte par utilisateur ET par workspace.
create table if not exists public.inrcy_mobile_shortcut_preferences (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.inrcy_accounts(id) on delete cascade,
  shortcuts jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (auth_user_id, account_id),
  constraint inrcy_mobile_shortcuts_is_array check (jsonb_typeof(shortcuts) = 'array')
);

alter table public.inrcy_mobile_shortcut_preferences enable row level security;

drop policy if exists "mobile_shortcuts_select_own_membership" on public.inrcy_mobile_shortcut_preferences;
drop policy if exists "mobile_shortcuts_insert_own_membership" on public.inrcy_mobile_shortcut_preferences;
drop policy if exists "mobile_shortcuts_update_own_membership" on public.inrcy_mobile_shortcut_preferences;
drop policy if exists "mobile_shortcuts_delete_own_membership" on public.inrcy_mobile_shortcut_preferences;

create policy "mobile_shortcuts_select_own_membership"
on public.inrcy_mobile_shortcut_preferences
for select
to authenticated
using (
  auth_user_id = auth.uid()
  and exists (
    select 1 from public.inrcy_account_members m
    where m.auth_user_id = auth.uid()
      and m.account_id = inrcy_mobile_shortcut_preferences.account_id
  )
);

create policy "mobile_shortcuts_insert_own_membership"
on public.inrcy_mobile_shortcut_preferences
for insert
to authenticated
with check (
  auth_user_id = auth.uid()
  and exists (
    select 1 from public.inrcy_account_members m
    where m.auth_user_id = auth.uid()
      and m.account_id = inrcy_mobile_shortcut_preferences.account_id
  )
);

create policy "mobile_shortcuts_update_own_membership"
on public.inrcy_mobile_shortcut_preferences
for update
to authenticated
using (auth_user_id = auth.uid())
with check (
  auth_user_id = auth.uid()
  and exists (
    select 1 from public.inrcy_account_members m
    where m.auth_user_id = auth.uid()
      and m.account_id = inrcy_mobile_shortcut_preferences.account_id
  )
);

create policy "mobile_shortcuts_delete_own_membership"
on public.inrcy_mobile_shortcut_preferences
for delete
to authenticated
using (auth_user_id = auth.uid());

create index if not exists inrcy_mobile_shortcut_preferences_account_idx
  on public.inrcy_mobile_shortcut_preferences(account_id);

grant select, insert, update, delete on public.inrcy_mobile_shortcut_preferences to authenticated;
