# Correctif iNrAgent — fiabilisation cron / campagnes automatiques

## Objectif
Rendre les automatisations iNrAgent plus fiables pour les campagnes Propulser/Fidéliser et éviter qu'une exécution ratée saute directement à la semaine suivante sans diagnostic exploitable.

## Modifications

### 1. Cron iNrAgent renforcé
Fichier : `app/api/cron/inr-agent/route.ts`

- Ajout d'une logique de retry automatique.
- En cas d'erreur temporaire ou serveur : `next_run_at` est replacé à +15 minutes au lieu de sauter directement au prochain créneau hebdomadaire.
- Maximum 4 tentatives avant retour au prochain créneau normal.
- Stockage détaillé dans `metadata` :
  - `lastCronStatus`
  - `lastCronError`
  - `lastCronErrorDetail`
  - `lastCronErrorCode`
  - `lastCronHttpStatus`
  - `lastCronEndpoint`
  - `lastCronRetriable`
  - `lastCronRetryCount`
  - `lastCronNextRetryAt`
  - `lastCronNextRegularRunAt`
- Contrôle supplémentaire : si une route répond OK mais sans action préparée, le cron considère cela comme une erreur retryable au lieu de marquer un faux succès.

### 2. Origine interne du cron corrigée
Fichier : `lib/cronAuth.ts`

- `getAppOriginFromRequest()` privilégie maintenant `NEXT_PUBLIC_APP_URL` avant `NEXT_PUBLIC_SITE_URL`.
- Cela évite qu'un cron tente d'appeler par erreur le site vitrine au lieu de l'application.

### 3. Recalcul de `next_run_at` plus intelligent à l'enregistrement
Fichier : `app/api/agent/settings/route.ts`

- Ajout d'une tolérance de 20 minutes : si l'utilisateur enregistre une automatisation très proche de l'heure prévue du jour, elle est mise en retard volontairement pour être prise au prochain passage cron.
- Si une automatisation avait échoué et n'a jamais préparé d'action, un nouvel enregistrement peut recalculer correctement `next_run_at`.
- La réponse API renvoie maintenant les réglages avec le `nextRunAt` réellement sauvegardé.

### 4. Bouton de test immédiat dans iNrAgent
Fichiers :
- `app/dashboard/agent/AgentClient.tsx`
- `app/dashboard/agent/agent.module.css`

- Ajout d'un bouton dans la modale de réglage :
  - `Préparer maintenant` pour Publier / Propulser / Fidéliser.
  - `Envoyer un bilan test` pour Statistiques.
- Le bouton sauvegarde d'abord les réglages, puis lance l'action tout de suite sans attendre le prochain cron.

## SQL
Aucun SQL nécessaire.
