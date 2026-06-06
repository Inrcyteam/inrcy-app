-- iNrCy — Stats réelles iNr'Badge
-- Objectif : suivre les vues, scans QR, clics et demandes issues de la fiche publique.

CREATE TABLE IF NOT EXISTS public.inrbadge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('view', 'qr_scan', 'action_click', 'lead_submit', 'appointment_request')),
  action_key text,
  target_url text,
  source text,
  referrer text,
  visitor_id text,
  daily_visit_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inrbadge_events_daily_visit_key_uidx
  ON public.inrbadge_events (daily_visit_key)
  WHERE daily_visit_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS inrbadge_events_user_created_idx
  ON public.inrbadge_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inrbadge_events_user_type_created_idx
  ON public.inrbadge_events (user_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS inrbadge_events_user_action_created_idx
  ON public.inrbadge_events (user_id, action_key, created_at DESC)
  WHERE action_key IS NOT NULL;

ALTER TABLE public.inrbadge_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inrbadge_events_owner_select" ON public.inrbadge_events;
CREATE POLICY "inrbadge_events_owner_select"
  ON public.inrbadge_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Les inserts publics passent par les routes serveur avec SUPABASE_SERVICE_ROLE_KEY.
-- Aucun INSERT direct anon/authenticated n'est ouvert.
