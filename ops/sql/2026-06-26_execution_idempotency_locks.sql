-- Idempotence technique pour les exécutions programmées iNrCy.
-- Objectif : empêcher les doubles publications / doubles envois en cas de retry, timeout ou double appel cron.

create table if not exists public.execution_idempotency_locks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  idempotency_key text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'expired')),
  result jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  locked_at timestamptz not null default now(),
  completed_at timestamptz,
  failed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint execution_idempotency_locks_user_scope_key_unique unique (user_id, scope, idempotency_key)
);

create index if not exists execution_idempotency_locks_user_scope_status_idx
  on public.execution_idempotency_locks (user_id, scope, status, created_at desc);

create index if not exists execution_idempotency_locks_expires_at_idx
  on public.execution_idempotency_locks (expires_at)
  where status = 'running';

create or replace function public.set_execution_idempotency_locks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_execution_idempotency_locks_updated_at on public.execution_idempotency_locks;
create trigger set_execution_idempotency_locks_updated_at
before update on public.execution_idempotency_locks
for each row
execute function public.set_execution_idempotency_locks_updated_at();

alter table public.execution_idempotency_locks enable row level security;

drop policy if exists "execution_idempotency_locks_service_role_all" on public.execution_idempotency_locks;
create policy "execution_idempotency_locks_service_role_all"
  on public.execution_idempotency_locks
  for all
  to service_role
  using (true)
  with check (true);
