# iNrAgent V2 — Étape 14 — Rubriques compactes

## Objectif
Retravailler les 4 grandes rubriques du haut pour gagner de la hauteur sans perdre la lisibilité, et élargir la zone Date dans la barre compacte de l’aperçu.

## Modifications réalisées

- Cartes rubriques rendues plus compactes.
- Icônes principales conservées mais légèrement réduites et modernisées.
- Titres plus denses, toujours lisibles.
- Bouton de réglage remplacé visuellement par une pastille de programmation avec icône horloge.
- Pastille de réglage centrée verticalement à droite de chaque rubrique.
- Voyant actif et badge “à valider” repositionnés pour éviter les chevauchements.
- Zone Date de l’aperçu élargie pour accueillir une vraie date programmée.
- Canaux conservent le reste de la largeur disponible.

## Fichiers modifiés

- `app/dashboard/agent/AgentClient.tsx`
- `app/dashboard/agent/agent.module.css`

## SQL
Aucun nouveau SQL à lancer.

## Remarque
Le typecheck complet n’a pas été lancé dans le sandbox car `node_modules` n’est pas présent.
