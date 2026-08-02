# Pinterest — ratio commun intelligent des carrousels

## Correction

Pour un carrousel Pinterest de 2 à 5 images avec des proportions différentes, iNrCy ne prend plus automatiquement la première image comme référence.

Le moteur :

- analyse les ratios visuels réels après orientation EXIF ;
- évalue les ratios présents dans tout le carrousel ;
- choisit celui qui minimise la modification visuelle totale des images ;
- favorise naturellement le ratio majoritaire lorsqu'il est le meilleur choix ;
- respecte le plancher Pinterest de 2:3 ;
- conserve les originaux quand tous les ratios sont déjà identiques ;
- applique toujours le seuil de recadrage léger de 8 %, puis un fond noir uni sans flou lorsque le recadrage serait trop destructeur.

## Exemples

- 4 portraits et 1 paysage : format portrait retenu.
- 4 paysages et 1 portrait : format paysage retenu.
- 3 carrés et 2 portraits : format carré retenu si c'est celui qui minimise les adaptations.

## Validation

- Suite Pinterest : 21 tests réussis sur 21.
- Le typecheck global n'a pas pu être certifié dans cette archive sans dépendances, car les modules React, Next et types Node ne sont pas installés.
