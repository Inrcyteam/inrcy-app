-- iNr'Agent V1 - table de configuration par professionnel

create table if not exists public.inr_agent_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  frequency text not null default 'weekly' check (frequency in ('weekly', 'biweekly', 'monthly')),
  day_of_week smallint not null default 1 check (day_of_week between 0 and 6),
  time text not null default '09:00' check (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  mode text not null default 'validation_required' check (mode in ('draft_only', 'validation_required', 'automatic')),
  goal text not null default 'visibility' check (goal in ('visibility', 'acquisition', 'loyalty', 'reviews')),
  tone text not null default 'professional' check (tone in ('professional', 'friendly', 'premium', 'local', 'dynamic')),
  allowed_actions text[] not null default array['publication', 'mailing', 'review_request', 'loyalty'],
  allowed_channels text[] not null default array['site_inrcy', 'site_web', 'gmb', 'facebook', 'instagram', 'linkedin', 'mails'],
  use_media_library boolean not null default true,
  allow_ai_images boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inr_agent_settings enable row level security;

drop policy if exists "Users can read own inr agent settings" on public.inr_agent_settings;
create policy "Users can read own inr agent settings"
on public.inr_agent_settings
for select
using (auth.uid() = user_id);

-- Les insert/update passent par l'API serveur avec supabaseAdmin.
-- Tu peux continuer à modifier manuellement depuis Supabase.
