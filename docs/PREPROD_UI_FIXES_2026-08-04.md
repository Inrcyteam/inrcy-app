# Correctifs preproduction Booster / iNrSend - 2026-08-04

## Booster Publier

- Les inputs fichiers images et video restent montes dans le parcours manuel.
- Les boutons Ajouter des images et Ajouter une video ouvrent donc le selecteur natif dans les deux parcours.
- Un choix explicite Aucun / Retirer de ce canal a priorite sur les fallbacks automatiques, y compris TikTok et YouTube Shorts.
- Le texte d'aide du mode de creation est raccourci.
- Les icones des canaux sont prechargees des l'ouverture de Booster et restent en chargement eager/high priority.

## iNrSend

- La suppression d'une publication libere l'etat d'action des que l'API confirme la suppression.
- Le rafraichissement de l'historique se poursuit en arriere-plan.
- L'utilisateur peut donc changer de canal sans attendre le rechargement complet de la liste.

## Verification ciblee

- 5 tests structurels ajoutes et valides.
