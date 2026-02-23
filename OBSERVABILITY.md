# Observability (1k → 10k clients)

Ce projet inclut maintenant un socle **simple** d’observabilité :

## 1) Correlation ID (request id)

- Le middleware ajoute automatiquement un header `x-request-id` à **toutes** les routes `/api/*`.
- La réponse renvoie également `x-request-id`.

➡️ Quand un client a un bug, tu lui demandes le `x-request-id` (ou tu le retrouves dans le DevTools / Network).

## 2) Logs JSON structurés

Fichier : `lib/observability/logger.ts`

- Les logs sont au format JSON, parfait pour Vercel/Log drains.
- Aucune donnée sensible ne doit être logguée (tokens, mots de passe, cookies).

## 3) Wrapper d’API

Fichier : `lib/observability/withApi.ts`

Ce wrapper :
- mesure la durée
- loggue `status_code`, `route`, `method`, `duration_ms`, `ip`, `request_id`
- renvoie une erreur propre (et un `request_id`) en cas d’exception

Routes déjà branchées :
- `/api/health`
- `/api/widgets/issue-token`
- `/api/booster/generate`
- `/api/inbox/gmail/send`
- `/api/inbox/microsoft/send`
- `/api/inbox/imap/send`
- `/api/integrations/imap/connect`

Tu peux brancher `withApi()` sur n’importe quelle autre route critique en 30 secondes.

## 4) Healthcheck

Route : `GET /api/health`

- vérifie les variables d’environnement critiques
- ping Supabase (requête ultra légère)

## 5) Fetch robuste (timeouts + retry)

Fichier : `lib/observability/fetch.ts`

`fetchWithRetry()` gère :
- timeout (par défaut 15s)
- retry (par défaut 2)
- backoff exponentiel

Déjà utilisé sur :
- OpenAI (`lib/openaiClient.ts`)
- Refresh token Microsoft (`app/api/inbox/microsoft/send/route.ts`)

## 6) Recommandé (très simple) : brancher Sentry

Même si tu n’ajoutes qu’un outil externe, choisis Sentry.

Étapes :
1. Créer un projet Sentry (Next.js)
2. Ajouter `SENTRY_DSN` dans Vercel (Production + Preview)
3. Installer :
   ```bash
   npm i @sentry/nextjs
   ```
4. Suivre le setup Sentry Next (3 fichiers de config)

Ça te donne :
- erreurs groupées
- stack traces lisibles (avec sourcemaps)
- alertes (spikes / first seen)
