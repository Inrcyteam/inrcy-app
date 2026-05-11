create table if not exists public.instagram_action_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  publication_id uuid null,
  action text not null check (action in ('verify_delete', 'delete', 'replace')),
  external_id text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists instagram_action_logs_user_created_idx
  on public.instagram_action_logs (user_id, created_at desc);

create index if not exists instagram_action_logs_publication_idx
  on public.instagram_action_logs (publication_id, created_at desc);

alter table public.instagram_action_logs enable row level security;

drop policy if exists "instagram_action_logs_select_own" on public.instagram_action_logs;
create policy "instagram_action_logs_select_own"
  on public.instagram_action_logs
  for select
  using (auth.uid() = user_id);
