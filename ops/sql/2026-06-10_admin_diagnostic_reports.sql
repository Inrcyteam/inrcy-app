-- iNrCy — rapports diagnostics admin
create table if not exists public.inrcy_diagnostic_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open','resolved')),
  source text,
  reason text,
  automatic boolean not null default false,
  client_name text,
  company text,
  phone text,
  message text,
  summary text,
  url text,
  user_agent text,
  report text not null,
  resolved_at timestamptz,
  resolved_by uuid
);

create index if not exists inrcy_diagnostic_reports_status_idx on public.inrcy_diagnostic_reports(status);
create index if not exists inrcy_diagnostic_reports_created_at_idx on public.inrcy_diagnostic_reports(created_at desc);

alter table public.inrcy_diagnostic_reports enable row level security;
