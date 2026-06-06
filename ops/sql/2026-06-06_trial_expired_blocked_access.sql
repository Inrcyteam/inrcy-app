-- iNrCy — fin d'essai sans abonnement
-- Objectif : ne plus supprimer le compte à J+30, mais le passer en trial_expired.

-- ÉTAPE 1 — à exécuter seule si la colonne subscriptions.status est bien de type enum.
ALTER TYPE public.stripe_subscription_status
  ADD VALUE IF NOT EXISTS 'trial_expired';

-- ÉTAPE 2 — à exécuter après validation de l'étape 1.
-- Cette requête rattrape les comptes Trial déjà expirés sans abonnement Stripe.
UPDATE public.subscriptions
SET
  status = 'trial_expired'::public.stripe_subscription_status,
  updated_at = now()
WHERE plan = 'Trial'
  AND stripe_subscription_id IS NULL
  AND (
    status IS NULL
    OR status::text IN ('trialing', 'trailing', 'essai', 'incomplete', 'incomplete_expired')
  )
  AND (
    (trial_end_at IS NOT NULL AND trial_end_at <= now())
    OR (trial_end_at IS NULL AND start_date IS NOT NULL AND (start_date::date + interval '30 days') <= now())
  );
