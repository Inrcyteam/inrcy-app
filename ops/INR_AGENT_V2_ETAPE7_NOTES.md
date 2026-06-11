# iNrAgent V2 - Étape 7

Objectif : brancher **Analyser mes statistiques** sur un vrai bilan iNrStats PDF envoyé automatiquement au pro.

## Ajout principal

Nouvelle route :

- `POST /api/agent/actions/send-stats-report`

La route :

1. vérifie l’utilisateur connecté ;
2. récupère les réglages `stats` pour respecter les rubriques choisies ;
3. récupère les statistiques à l’instant T :
   - `/api/stats/dashboard-bulk?days=30&fresh=1` pour les canaux ;
   - `/api/inrstats/mails` pour Mails / Propulser / Fidéliser / iNrSend ;
   - `/api/inrstats/inrbadge` pour iNrBadge ;
4. génère une analyse globale iNrAgent ;
5. crée un PDF multi-pages avec `jsPDF` ;
6. envoie le PDF au pro par email transactionnel avec `sendTxMail` ;
7. enregistre une action `stats_report` dans `inr_agent_actions` ;
8. met à jour `last_prepared_at` et `last_executed_at` pour l’automatisation `stats`.

## Interface iNrAgent

Dans la famille **Analyser mes statistiques**, l’écran vide affiche maintenant :

- `Générer et envoyer le bilan PDF`

Contrairement aux publications et campagnes, ce bilan ne demande pas de validation finale : il est envoyé au pro après paramétrage.

## Important

- Aucun nouveau SQL n’est nécessaire.
- L’envoi utilise les variables SMTP transactionnelles déjà utilisées ailleurs :
  - `TX_SMTP_HOST`
  - `TX_SMTP_PORT`
  - `TX_SMTP_USER`
  - `TX_SMTP_PASS`
  - `TX_MAIL_FROM` optionnel
- Le cron automatique n’est pas encore branché dans cette étape. Cette étape ajoute le moteur PDF + email manuel depuis iNrAgent. Le cron sera l’étape suivante et respectera le statut activé/désactivé.

## Fichiers modifiés / ajoutés

- `app/api/agent/actions/send-stats-report/route.ts`
- `app/dashboard/agent/AgentClient.tsx`
- `ops/INR_AGENT_V2_ETAPE7_NOTES.md`
