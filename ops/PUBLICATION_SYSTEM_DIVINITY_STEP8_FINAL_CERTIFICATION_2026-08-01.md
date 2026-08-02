# Publication System — Étape 8 — Certification finale

Date : 2026-08-01

## Objet

Certifier cumulativement les étapes 1 à 7, rechercher toute régression dans le pipeline média et la publication multi-canal, comparer la livraison à la base d'origine, puis figer un ZIP propre sans dépendances.

## Modifications de l'étape 8

Aucun comportement runtime n'a été changé pendant cette étape.

Deux assertions historiques de `tests/media-pipeline/media-original-first-architecture.test.mjs` attendaient encore les versions de cache image et vidéo `4`. Les étapes Google Business et Transparence avaient volontairement incrémenté ces caches à `5`. Les assertions ont été réalignées sur le runtime actuel.

L'étape ajoute également :

- `scripts/audit-publication-system-step8.mjs` ;
- `tests/publication-system/publication-system-step8-final-certification.test.mts` ;
- les commandes npm `audit:publication-system:step8`, `test:publication-system:step8`, `qa:publication-system:step8` et `certify:publication-system`.

## Résultats certifiés

- Certification publication étapes 1 à 8 : 206 tests, 0 échec.
- Certification média complète : 373 tests, 0 échec.
- Tests natifs image ciblés : 18 tests, 0 échec.
- Sécurité du contenu Booster : 13 tests, 0 échec.
- iNr'Search : 23 tests, 0 échec.
- Audit final : 13 contrôles sur 13.
- Tests fonctionnels finaux : 6 sur 6.
- TypeScript complet : aucune erreur.
- Lint des 55 fichiers ajoutés ou modifiés : aucune erreur, aucun avertissement.

Les tests natifs image ont été exécutés dans l'environnement Linux avec le module Sharp système compatible. Le lockfile de livraison reste verrouillé sur Sharp 0.35.3 ; le ZIP ne contient aucune dépendance native.

## Contrôle différentiel avec la base d'origine

- Runtime : 6 fichiers ajoutés, 34 fichiers modifiés, 0 fichier supprimé.
- Assets publics : aucun ajout, aucune suppression, aucune modification.
- `package-lock.json` : inchangé.
- SQL : aucune nouvelle migration ; deux scripts historiques de durcissement/vérification ont été réalignés du seuil 39 MiB vers le plafond canonique 299 MiB.

## Invariants finaux

- Adapter est prioritaire uniquement pour le média et le canal explicitement personnalisés.
- Les médias non modifiés restent originaux.
- La source vidéo est acceptée jusqu'à 300 Mo, sans plafond global artificiel à 40 Mo.
- Une vidéo compressée à 220 Mo reste publiable sur les canaux qui l'acceptent.
- Google Business reçoit sa variante dédiée sous marge, sans coupe silencieuse au-delà de 30 secondes.
- Meta est centralisé derrière une version unique et configurable.
- Un texte publié sans média est `published_with_warning`, jamais un échec silencieux.
- TikTok reste `processing` tant que son statut n'est pas terminal.
- Les PNG, WebP et AVIF transparents restent transparents sur Site iNrCy, Site web et iNr'Search.
- Facebook limite le parallélisme image et conserve l'ordre du carrousel.
- Aucun fond flouté n'est réintroduit.

## Build

Le build Next n'a pas pu démarrer dans l'environnement d'audit, car les dépendances fournies avec la base de contrôle contenaient uniquement le binaire SWC Windows. L'erreur intervient avant le chargement du code iNrCy : `@next/swc-linux-x64-gnu` est absent.

La validation de déploiement doit repartir d'une installation propre sur Linux/Vercel :

```bash
npm ci
npm run certify:publication-system
```

Le ZIP de livraison ne contient ni `node_modules`, ni `.next`, ni cache TypeScript, ni fichier d'environnement.
