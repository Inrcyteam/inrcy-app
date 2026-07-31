# iNrCy — Booster PublishNow — Étape 5

## Contexte déterministe par canal

Date : 31 juillet 2026

## Objectif

Réduire `app/api/booster/publish-now/route.ts` sans déplacer ni modifier les envois réseau, les jetons OAuth, les accès Supabase, les verrous d’idempotence, le fan-out asynchrone ou les workers médias.

Cette étape isole uniquement les calculs déterministes utilisés avant chaque envoi :

- résolution de la vidéo ou de sa variante pour un canal ;
- construction du contenu final par canal ;
- sélection d’un jeu d’images complet sans emprunter le recadrage d’un autre canal.

## Modifications

### Fichier principal

- `route.ts` : 3 784 lignes avant, 3 628 lignes après ;
- réduction nette : 156 lignes.

### Nouveau module

- `app/api/booster/publish-now/publishNow.channel-context.ts` : 255 lignes.

Trois fabriques déterministes ont été ajoutées :

1. `createPublishNowVideoContext`
2. `createPublishNowPostResolver`
3. `createPublishNowImageContext`

Elles regroupent 15 déclarations auparavant locales à la route :

- 2 résolveurs vidéo ;
- 5 déclarations de contenu et fallback ;
- 8 déclarations liées aux images et à leur complétude.

## Garanties de périmètre

Le nouveau module ne contient aucun :

- `fetch` ;
- accès Supabase ou Storage ;
- `NextResponse` ;
- verrou d’idempotence ;
- déchiffrement ou rafraîchissement OAuth ;
- `Buffer` ;
- worker média ;
- appel de publication vers un réseau.

Les éléments suivants restent dans `route.ts` :

- `setDelivery` ;
- chargement de la vidéo TikTok depuis Storage ;
- rafraîchissement des jetons TikTok et YouTube ;
- toutes les branches de publication ;
- tous les traitements de succès, échec, statut et finalisation.

## Fidélité vérifiée

- Les 15 déclarations déplacées sont structurellement identiques hors indentation.
- La route depuis `setDelivery` jusqu’à la fin est octet pour octet identique.
  - 74 477 caractères ;
  - SHA-256 : `1300eaf196db8d590734f208beac854248992f5c57ce3b51d1975591b682d88b`.
- La boucle complète `for (const ch of selected)` et toutes les branches réseau sont octet pour octet identiques.
  - 69 719 caractères ;
  - SHA-256 : `7c84befd425ab303373a551cf173d1b9796620d4b2698f25080ed918710b44b7`.
- 15 000 lots aléatoires de comparaison ont produit exactement les mêmes résultats pour :
  - le contenu par canal ;
  - les fallbacks de contenu et hashtags ;
  - les variantes vidéo ;
  - les fallbacks vers la vidéo source compatible ;
  - les jeux d’images complets et les limites de carrousel.

## Tests et audits

- 82 tests ciblés réussis ;
- 679 tests source exécutables réussis ;
- 16 audits internes réussis ;
- 1 264 fichiers TypeScript analysés : 0 erreur de syntaxe ;
- 3 542 imports internes de code analysés : 0 import cassé ;
- 0 cycle autour de `publish-now` ;
- 0 import inutilisé dans les deux fichiers concernés ;
- comparaison TypeScript origine/final : 0 nouveau diagnostic de production.

Deux tests natifs ne peuvent pas démarrer sans les dépendances installées :

- `media-pipeline-bmp-normalization.test.mts` nécessite `bmp-js` ;
- `media-pipeline-production-regressions.test.mts` nécessite `sharp`.

Les trois nouveaux diagnostics du typecheck comparatif concernent seulement le nouveau test d’architecture et l’absence locale des types Node. Aucun diagnostic de production supplémentaire n’est introduit.

## Fichiers de production sensibles confirmés identiques

Notamment :

- `publishNow.foundations.ts` ;
- `publishNow.server-preparation.ts` ;
- `boosterAsyncPublication.ts` ;
- `executionIdempotency.ts` ;
- `mediaWorkspaceConsumption.ts` ;
- `boosterImageServerPreparation.ts` ;
- `boosterVideoVariantServer.ts` ;
- route de statut ;
- cron de récupération ;
- implémentations Facebook, Instagram, LinkedIn, TikTok, YouTube, Pinterest et Google Business.

## Inventaire du diff

Avant l'ajout de cette documentation :

- 5 fichiers existants modifiés ;
- 2 fichiers ajoutés ;
- 0 fichier supprimé.

Les quatre tests existants modifiés ont uniquement été adaptés pour lire les garanties dans leur nouvel emplacement. Un nouveau test interdit explicitement les effets de bord dans le module de contexte canal.

## Limites de validation

Le lint complet, le build Next.js et un typecheck global réussi de bout en bout nécessitent l'installation intégrale de `node_modules`. Ils restent à confirmer dans la CI du projet.

## Verdict

Le découpage est maîtrisé et transparent pour l'exécution. Il réduit la route sans modifier le moteur de publication, le nouveau pipeline média ou les implémentations propres aux réseaux.
