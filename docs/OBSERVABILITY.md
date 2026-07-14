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

Recommandations RGPD (important) :
- **Minimiser** les données : privilégier `user_id` plutôt que `email`.
- **Éviter** de logguer des tokens OAuth / Stripe / etc.
- **Durée de conservation** : garder les logs techniques le minimum nécessaire (ex: 30 jours), et limiter l’accès.

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

## 7) Intégration Sentry iNrCy

Le projet est désormais branché sur Sentry côté navigateur, serveur et runtime Edge.

Les erreurs capturées par les routes critiques sont enrichies avec :

- le module (`booster`, `crm_campaigns`, `inrstats`, `inrcalendar`, `documents`, `inragent`)
- l’opération et la méthode HTTP
- le `request_id` pour recroiser avec les logs Vercel
- l’environnement et le commit déployé
- un identifiant utilisateur/établissement pseudonymisé, sans email

Parcours couverts en priorité :

- Booster : génération IA, publication immédiate et actions par canal
- Propulser/Fidéliser : création, relance et traitement des campagnes mails
- iNrStats : synthèse, statistiques globales, opportunités, Mails, iNr’Badge et rafraîchissement des canaux
- iNrCalendar : événements et paramètres
- Factures : finalisation
- iNrCRM : contacts et campagnes
- iNrAgent : configuration, programmation et exécution

Variables à renseigner dans Vercel :

```text
SENTRY_DSN=...
NEXT_PUBLIC_SENTRY_DSN=...
SENTRY_AUTH_TOKEN=...                 # uniquement pour l’upload des sourcemaps en CI
SENTRY_TRACES_SAMPLE_RATE=0.1         # ajustable selon le volume
```

Le filtre Sentry retire les cookies, autorisations, paramètres OAuth (`code`, `state`, tokens),
les corps de requête et les champs métier sensibles. `sendDefaultPii` reste désactivé.

À vérifier après déploiement :

1. provoquer une erreur de test contrôlée en Preview ;
2. vérifier l’événement dans Sentry avec son module et son `request_id` ;
3. ouvrir les logs Vercel et retrouver le même `request_id` ;
4. créer des alertes séparées pour les erreurs `booster`, `crm_campaigns`, `inrstats`, `inrcalendar`, `documents` et `inragent`.
