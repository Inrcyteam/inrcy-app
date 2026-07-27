# iNrSearch — stabilité graphique mobile, étape 2

## Périmètre

Cette étape cible uniquement les pages publiques iNrSearch sur téléphone et appareils tactiles. Aucun composant du Dashboard, de Booster, de la Boîte de vitesse ou d’un autre outil n’est modifié.

## Modifications

- Les téléphones passent systématiquement en mode de mouvement allégé, même lorsque `deviceMemory` est absent dans une WebView Messenger, Facebook ou Instagram.
- Le parallaxe piloté par le pointeur n’est plus enregistré sur les appareils tactiles.
- Une couche CSS mobile finale neutralise les animations décoratives permanentes, les grands flous arrière et la recomposition `mix-blend-mode`.
- Les couleurs, positions, dimensions, bordures, boutons, ombres, contenus et dispositions responsive sont conservés.
- Aucun CSS historique n’est supprimé à cette étape. Le nettoyage reste volontairement séparé pour l’étape 6.

## Fichiers modifiés

- `app/entreprises/[slug]/InrSearchVisualIdentity.tsx`
- `app/entreprises/[slug]/InrSearchExperience.tsx`
- `app/entreprises/[slug]/inrSearchPublic.module.css`

## Fichiers ajoutés

- `tests/inr-search/inrsearch-mobile-stability.test.mts`
- `docs/INRSEARCH_MOBILE_STABILITY_STEP2.md`

## Non modifié

- Hauteur `100dvh` et gestion du redimensionnement : étape 3.
- Ligne blanche générale de l’application : étape 4.
- Suppression du CSS obsolète : étape 6.
