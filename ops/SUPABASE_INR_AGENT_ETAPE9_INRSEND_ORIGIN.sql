-- Étape 9 iNr'Agent → iNr'Send
-- Ajoute un champ léger pour marquer les campagnes Propulser/Fidéliser générées par iNr'Agent.
-- Les publications Booster utilisent déjà app_events.payload, donc pas de colonne supplémentaire pour elles.

alter table public.mail_campaigns
add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists mail_campaigns_inr_agent_metadata_idx
on public.mail_campaigns ((metadata->>'source'))
where metadata ? 'source';
