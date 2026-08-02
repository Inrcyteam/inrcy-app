# Système de publication — Étape 1 : base sécurisée

Date : 1er août 2026

## Objectif

Cette étape ne modifie aucun comportement visible ni aucun connecteur réseau. Elle fige les invariants critiques avant les correctifs Google Business, vidéo, Meta, bilan et transparence.

## Invariants verrouillés

- Adapter est prioritaire uniquement pour le média explicitement personnalisé.
- La personnalisation est isolée par canal et par `imageKey`.
- « Appliquer à tous » enregistre une décision explicite pour chaque média.
- Les médias non modifiés restent originaux.
- Les anciens fonds floutés restent neutralisés.
- La source vidéo reste acceptée jusqu'à 300 Mo.
- Aucun plafond global artificiel à 40 Mo n'est réintroduit.
- La publication reste parallèle, idempotente et indépendante par canal.
- Une publication texte réussie avec média refusé reste un succès avec avertissement.
- Le nouveau workspace média reste la source stricte de publication.

## Chantiers volontairement non modifiés à cette étape

1. politique vidéo dédiée Google Business ;
2. centralisation et migration de la version Meta ;
3. statut final « publiée avec avertissement » ;
4. préservation de la transparence PNG/WebP ;
5. optimisation mémoire et concurrence des connecteurs.

## Commande de certification de l'étape 1

```bash
npm run qa:publication-system:step1
```

Cette commande exécute l'audit structurel, les tests dédiés, les tests image Booster, les tests dashboard et le typecheck.

## Résultat de référence

- TypeScript : attendu sans erreur.
- Tests dashboard : attendus sans erreur.
- Tests Booster images et règles médias : attendus sans erreur.
- Tests dédiés Étape 1 : attendus sans erreur.
- Tests Sharp natifs : nécessitent un `npm ci` sur l'OS d'exécution ; ne jamais réutiliser un dossier `node_modules` provenant d'un autre système.
