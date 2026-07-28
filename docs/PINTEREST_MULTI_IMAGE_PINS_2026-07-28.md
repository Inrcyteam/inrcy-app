# Pinterest - épingles multi-images (28/07/2026)

## Correction

- Une publication Pinterest avec 1 image conserve `media_source.source_type = image_url`.
- Une publication avec 2 à 5 images utilise `media_source.source_type = multiple_image_urls`.
- Les images sont transmises dans leur ordre de sélection, avec la première comme image principale (`index = 0`).
- Booster ne bloque plus Pinterest lorsqu'il y a plusieurs images.
- Les publications immédiates et programmées conservent jusqu'à 5 images.
- iNrAgent peut remplacer une épingle Pinterest en conservant les 1 à 5 images modifiées.

## Contrôles

- 9 tests Pinterest réussis.
- Contrôle syntaxique TypeScript/TSX réussi sur les fichiers modifiés.
- Le typecheck global n'a pas pu être terminé dans l'environnement d'analyse à cause d'une indisponibilité temporaire du registre npm (HTTP 503 lors de l'installation des dépendances).
