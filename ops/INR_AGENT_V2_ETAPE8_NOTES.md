# iNr'Agent V2 — Étape 8

## Objectif
Rendre iNr'Agent autonome avec un cron serveur.

## Ajouts principaux

### 1. Cron automatique
Nouvelle route :

```txt
/api/cron/inr-agent
```

Programmée dans `vercel.json` :

```json
{ "path": "/api/cron/inr-agent", "schedule": "*/15 * * * *" }
```

Le cron vérifie les automatisations actives :

- `publish` : prépare une publication Booster à valider.
- `grow` : prépare une campagne Propulser à valider.
- `loyalty` : prépare une campagne Fidéliser à valider.
- `stats` : génère et envoie le bilan iNrStats PDF automatiquement.

## Sécurité
Le cron est protégé par :

- `VERCEL_CRON_SECRET`
- ou `CRON_SECRET`

Headers acceptés :

- `Authorization: Bearer <secret>`
- `x-cron-secret: <secret>`

## Anti-doublon
Le cron évite de préparer plusieurs actions identiques :

- pas de doublon si une action ouverte existe déjà sur la période.
- mise à jour de `next_run_at` après chaque tentative.
- stockage des erreurs cron dans `metadata` des réglages d'automatisation.

## Règles d'exécution

- Publier régulièrement : préparation uniquement, validation pro obligatoire.
- Développer l'activité : préparation uniquement, validation pro obligatoire.
- Fidéliser les contacts : préparation uniquement, validation pro obligatoire.
- Analyser mes statistiques : génération + envoi automatique au pro.

## Routes compatibles cron
Les routes suivantes peuvent maintenant être appelées de façon interne par le cron avec `cronUserId` :

- `/api/agent/actions/prepare-publish`
- `/api/agent/actions/prepare-campaign`
- `/api/agent/actions/send-stats-report`

Pour le bilan stats automatique, ces routes acceptent aussi le contexte cron :

- `/api/stats/dashboard-bulk`
- `/api/inrstats/mails`
- `/api/inrstats/inrbadge`

## Test rapide
Après déploiement et configuration de `VERCEL_CRON_SECRET`, tu peux tester :

```txt
GET /api/cron/inr-agent?dryRun=1&secret=<VERCEL_CRON_SECRET>
```

Puis en réel :

```txt
GET /api/cron/inr-agent?secret=<VERCEL_CRON_SECRET>
```

## Aucun nouveau SQL
Pas de nouveau SQL à lancer pour cette étape si `SUPABASE_INR_AGENT_V2.sql` a déjà été exécuté.
