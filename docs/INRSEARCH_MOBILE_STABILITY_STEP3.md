# iNrSearch — stabilité de hauteur mobile, étape 3

## Périmètre

Cette étape poursuit uniquement la stabilisation des pages publiques iNrSearch sur téléphone et tablette tactile. Aucun Dashboard, bouton, bordure, outil métier ou design desktop n'est modifié.

## Modifications

- Les 47 références `100dvh` d'iNrSearch passent par une variable commune, avec un fallback desktop strictement identique à `100dvh`.
- Sur mobile, le CSS utilise immédiatement `100svh` lorsqu'il est supporté, puis JavaScript verrouille la hauteur réelle en pixels.
- Les changements de hauteur provoqués par l'affichage ou le masquage des barres Chrome, Safari, Messenger, Facebook ou Instagram sont ignorés.
- La hauteur est recalculée uniquement lors d'un véritable changement de largeur, d'une rotation ou d'un changement de mode mobile/desktop.
- Après rotation, le chapitre actif est réaligné sans animation afin d'éviter tout décalage horizontal.
- Les modales, scènes, panneaux, univers et calculs dimensionnels utilisent tous la même hauteur stable.

## Fichiers modifiés

- `app/entreprises/[slug]/InrSearchExperience.tsx`
- `app/entreprises/[slug]/inrSearchPublic.module.css`

## Fichiers ajoutés

- `tests/inr-search/inrsearch-mobile-viewport-stability.test.mts`
- `docs/INRSEARCH_MOBILE_STABILITY_STEP3.md`

## Non modifié

- Design, couleurs, bordures, boutons et composition.
- Autres outils de l'application.
- Correction de la ligne blanche globale : étape 4.
- Suppression du CSS obsolète : étape 6.
