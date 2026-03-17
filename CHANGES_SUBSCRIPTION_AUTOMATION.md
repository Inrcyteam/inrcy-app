# Correctifs abonnement Stripe / Supabase

## Modifications livrées

- Alertes admin automatiques vers `abonnement@inrcy.com` pour :
  - début d'essai
  - checkout Stripe validé / abonnement programmé
  - activation réelle de l'abonnement
  - résiliation demandée
  - annulation de résiliation
  - fin d'abonnement Stripe
  - suppression automatique après fin d'essai
  - suppression automatique après fin de préavis
- Remplacement des relances d'essai `J20/J24/J27/J30` par `J-10/J-6/J-3/J-1`
- Suppression automatique des comptes à la fin du préavis de résiliation
- Centralisation de la suppression complète du compte Supabase
- Idempotency-Key ajoutée sur les appels Stripe sensibles
- Durée d'essai rendue paramétrable via `INRCY_TRIAL_DAYS` (défaut `30`)

## Fichiers principaux modifiés

- `app/api/admin/create-trial/route.ts`
- `app/api/billing/checkout/route.ts`
- `app/api/stripe/webhook/route.ts`
- `app/api/cron/billing/route.ts`
- `lib/stripeRest.ts`
- `lib/txTemplates.ts`
- `lib/subscriptionAdmin.ts` (nouveau)
- `lib/deleteUserAccount.ts` (nouveau)

## Variables d'environnement à vérifier

- `INRCY_TRIAL_DAYS` (optionnel, défaut `30`)
- `INRCY_SUBSCRIPTION_ALERT_EMAIL` (optionnel, défaut `abonnement@inrcy.com`)
- `VERCEL_CRON_SECRET` ou `CRON_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER_ID`
- `STRIPE_PRICE_ACCEL_ID`
- `STRIPE_PRICE_SPEED_ID` (ou `STRIPE_PRICE_FULL_ID`)
- `TX_SMTP_HOST`
- `TX_SMTP_PORT`
- `TX_SMTP_USER`
- `TX_SMTP_PASS`
- `TX_MAIL_FROM`

## Important

Le projet fourni ne contenait pas `node_modules`, donc je n'ai pas pu exécuter une validation applicative complète avec build de production. Les correctifs ont été faits directement dans le code et structurés pour rester compatibles avec l'architecture existante.
