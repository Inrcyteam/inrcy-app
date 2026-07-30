# Booster — Étape 5 : publication asynchrone par canal

Date : 30 juillet 2026

## Objectif

Supprimer le risque qu'une publication multicanale entière soit interrompue par la limite d'exécution de 180 secondes.

## Fonctionnement

1. `/api/booster/publish-now` valide les contenus et les médias, crée la publication et les livraisons, puis enregistre une tâche durable par canal.
2. L'API répond immédiatement avec HTTP `202` et un identifiant de publication.
3. Chaque canal est envoyé dans une exécution indépendante et protégée par une clé d'idempotence propre au couple `publication + canal`.
4. Le client interroge un endpoint de statut au lieu de conserver une requête HTTP longue.
5. Lorsque tous les canaux sont terminés, leurs résultats sont regroupés dans l'événement final visible dans iNr'Send.
6. Un cron toutes les minutes reprend les tâches restées en attente ou interrompues. Le verrou par canal empêche les doublons.

## Sécurités

- Aucun canal en échec ne bloque les autres.
- Une reprise réseau ne republie pas un canal déjà terminé.
- Les résultats partiels restent détaillés canal par canal.
- Le workspace média n'est finalisé qu'après l'agrégation complète.
- Si le secret cron existant n'est pas configuré, le comportement synchrone historique est conservé en repli.
- Les événements techniques sont masqués dans iNr'Send et remplacés par un seul événement final lisible.

## Fichiers principaux

- `app/api/booster/publish-now/route.ts`
- `app/api/booster/publications/[publicationId]/status/route.ts`
- `app/api/cron/booster-publications/route.ts`
- `lib/boosterAsyncPublication.ts`
- `lib/boosterPublishClient.ts`
- `app/api/inrsend/history/route.ts`
- `vercel.json`

## Déploiement

- Aucun SQL supplémentaire.
- Aucune nouvelle variable d'environnement.
- Le système utilise le secret cron déjà pris en charge par l'application : `VERCEL_CRON_SECRET` ou `CRON_SECRET`.
- Nouveau cron Vercel : `/api/cron/booster-publications`, toutes les minutes.

## Validation

- 5 tests spécifiques Étape 5.
- 5 tests de sécurité Étape 4.
- 6 tests TikTok Étape 3.
- 5 tests vidéo Étape 2.
- 31 tests iNr'Send.
- Total ciblé : 52 tests réussis.

Le contrôle TypeScript global complet n'a pas pu être exécuté sans les dépendances du projet. Le compilateur disponible ne signale sur les fichiers modifiés que les modules/types absents (`next`, types Node), et aucune erreur syntaxique propre aux changements.
