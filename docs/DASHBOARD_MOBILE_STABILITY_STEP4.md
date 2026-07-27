# Étape 4 — stabilité de la surface mobile du Dashboard

## Objectif

Supprimer les lignes blanches ou claires qui peuvent apparaître brièvement sur smartphone pendant une recomposition graphique, sans modifier la composition, les boutons, les bordures ni le responsive.

## Modifications ciblées

- Fond sombre continu appliqué au shell du Dashboard et à son viewport mobile.
- Fond `html/body` basculé vers la couleur du cockpit uniquement lorsqu’un Dashboard est présent.
- Overscroll interne contenu pour empêcher l’exposition du fond public clair.
- Dock inférieur conservé à l’identique visuellement, mais son `backdrop-filter` est retiré car son fond est déjà presque opaque.
- Ajout d’un recouvrement interne d’un pixel au-dessus du dock pour neutraliser les coutures de composition GPU.

## Périmètre

Aucune page publique, aucun outil métier, aucun bouton, aucune bordure fonctionnelle et aucune logique applicative ne sont modifiés. Aucun CSS obsolète n’est supprimé à cette étape.
