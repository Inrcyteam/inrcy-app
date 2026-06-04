-- iNr'Agent V1 - table des actions préparées par l'agent

create table if not exists public.inr_agent_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null default 'custom' check (action_type in ('publication', 'mailing', 'review_request', 'loyalty', 'custom')),
  target_tool text not null default 'agent' check (target_tool in ('booster', 'mails', 'propulser', 'fideliser', 'agent')),
  title text not null,
  summary text,
  preview_text text,
  target_channels text[] not null default array[]::text[],
  status text not null default 'pending' check (status in ('pending', 'draft', 'scheduled', 'validated', 'refused', 'completed')),
  scheduled_for timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inr_agent_actions_user_status
on public.inr_agent_actions (user_id, status, created_at desc);

create index if not exists idx_inr_agent_actions_user_created
on public.inr_agent_actions (user_id, created_at desc);

alter table public.inr_agent_actions enable row level security;

drop policy if exists "Users can read own inr agent actions" on public.inr_agent_actions;
create policy "Users can read own inr agent actions"
on public.inr_agent_actions
for select
using (auth.uid() = user_id);

-- Les insert/update/delete passent par l'API serveur avec supabaseAdmin.
-- Tu peux aussi créer/modifier des actions manuellement depuis Supabase pour tester l'écran.

-- Exemple de ligne de test à adapter avec un user_id réel :
-- insert into public.inr_agent_actions (user_id, action_type, target_tool, title, summary, preview_text, target_channels, status)
-- values (
--   '00000000-0000-0000-0000-000000000000',
--   'publication',
--   'booster',
--   'Publication de la semaine',
--   'Aperçu prêt pour Facebook, Instagram, Google Business et Site iNrCy.',
--   'Cette semaine, mettez en avant une réalisation récente et invitez vos clients à vous contacter.',
--   array['facebook', 'instagram', 'gmb', 'site_inrcy'],
--   'pending'
-- );
