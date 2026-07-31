# Booster `publish-now` — Étape 2 : durcissement sécurisé

Date : 31 juillet 2026

## Objectif

Corriger uniquement les cinq points de durcissement identifiés lors de l'étape 1, sans refactorer les branches propres aux réseaux et sans modifier les payloads du nouveau pipeline média.

## Modifications de production

### 1. Validation runtime des canaux

Une politique partagée a été ajoutée dans :

- `lib/boosterPublicationPolicy.ts`.

Elle centralise :

- les dix canaux pris en charge ;
- leurs libellés ;
- la normalisation et la déduplication ;
- la liste des erreurs terminales non retentables ;
- la décision commune `retryable`.

`publish-now` refuse désormais tout canal inconnu avant lecture du workspace, acquisition du verrou ou persistance. La réponse est déterministe :

- HTTP 400 ;
- code `unsupported_channel` ;
- `retryable: false` ;
- liste des valeurs invalides.

Une liste vide conserve une réponse HTTP 400 avec le code `channels_required`. Le dispatch interne malformé conserve son code `async_dispatch_invalid`.

### 2. Validations avant le verrou parent

Les contrôles suivants interviennent maintenant avant l'acquisition du verrou d'idempotence parent :

- liste de canaux vide ;
- erreur de payload vidéo ;
- vidéo absente alors qu'un canal vidéo est sélectionné.

Une requête invalide ne peut donc plus conserver inutilement un verrou jusqu'à expiration du TTL.

### 3. Fermeture du verrou sur exception inattendue

L'identifiant du verrou parent est désormais accessible au `catch` général. Lorsqu'une exception survient après son acquisition dans le parcours parent :

- le workspace est marqué en échec comme auparavant ;
- le verrou parent est explicitement marqué `failed` ;
- le code durable enregistré est `publish_now_failed` ;
- les workers internes par canal conservent leur traitement séparé et ne ferment pas prématurément le verrou parent.

Les chemins qui ferment déjà explicitement le verrou désactivent le filet général avant leur retour.

### 4. Politique `retryable` commune

Le résumé synchrone de `publish-now` et l'agrégateur asynchrone utilisent désormais la même règle. Les codes suivants restent toujours terminaux :

- `bubble_access_disabled` ;
- `unsupported_channel` ;
- `delivery_status_unknown`.

Une erreur explicitement marquée `retryable: false` reste également non retentable quel que soit le chemin d'exécution.

### 5. Fallback `unsupported_channel` déterministe

La branche défensive finale :

- marque la livraison en échec ;
- renvoie le code `unsupported_channel` ;
- expose un message utilisateur ;
- impose `retryable: false`.

Cette branche est normalement inaccessible grâce à la validation runtime initiale, mais elle reste sûre en profondeur.

## Éléments volontairement inchangés

Aucune modification n'a été apportée :

- aux payloads du workspace média ;
- à la préparation des images ;
- à la sélection des variantes vidéo ;
- à la compatibilité de la vidéo originale ;
- au fan-out d'un worker par canal ;
- aux implémentations Facebook, Instagram, LinkedIn, TikTok, YouTube, Pinterest ou Google Business ;
- aux routes de statut et au cron de récupération ;
- aux tables SQL, migrations, variables d'environnement ou configurations npm ;
- à `PublishModal.tsx`.

## Fichiers concernés

Modifiés :

- `app/api/booster/publish-now/route.ts` ;
- `lib/boosterAsyncPublication.ts` ;
- `tests/dashboard/booster-stage4-publication-safety.test.mts`.

Ajoutés :

- `lib/boosterPublicationPolicy.ts` ;
- `tests/dashboard/booster-publish-now-hardening.test.mts` ;
- ce rapport.

Aucun fichier n'a été supprimé.

## Validation

- nouveaux tests de durcissement : 7/7 ;
- suite Dashboard : 69/69 ;
- batterie globale exécutable : 669/669 ;
- audits internes : 16/16 avec code retour 0 ;
- fichiers TypeScript analysés : 1 258, aucune erreur de syntaxe ;
- imports internes contrôlés : 3 679, aucun import cassé ;
- typecheck comparatif origine/final : aucun nouveau diagnostic de production ;
- diff final : uniquement les fichiers listés ci-dessus ;
- aucun résidu de test ou fichier de build modifié.

Deux tests nécessitant réellement `sharp` ou `bmp-js` ne peuvent pas démarrer dans cet environnement sans `node_modules` :

- `media-pipeline-bmp-normalization.test.mts` ;
- `media-pipeline-production-regressions.test.mts`.

Le lint, le typecheck complet avec les dépendances installées et le build Next.js restent à confirmer par la CI du dépôt.

## Verdict

Les cinq points relevés à l'étape 1 sont corrigés localement. Le nouveau système de publication et de gestion des médias n'a pas été restructuré, et les branches réseau actives n'ont pas été modifiées.
