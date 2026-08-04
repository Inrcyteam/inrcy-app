# Booster - correctif publication mixte images / video

Date : 2026-08-04

## Incident

Une publication pouvait utiliser les images sur plusieurs canaux et la video sur un autre canal. Le workspace persistant ne conservant que le dernier type de media active, le serveur refusait les canaux utilisant l'autre type avec `workspace_media_mismatch`.

La verification video demandait egalement une variante avant d'accepter l'original compatible, ce qui provoquait une longue etape `Preparation de la variante video necessaire`.

## Correction

- Le type present dans le workspace reste la source principale.
- Le type absent est transmis comme payload de secours deja stocke, uniquement pour les canaux qui l'utilisent.
- Le mode strict accepte ce secours seulement lorsqu'il contient un media exploitable.
- Sans workspace correspondant ni secours valide, le blocage strict reste actif.
- Une video originale compatible est acceptee des la premiere verification.
- Aucune variante video n'est fabriquee uniquement parce que le canal est externe.
- La meme logique est appliquee a la publication immediate et programmee.

## Tests

- `npm run test:dashboard` : 133/133
- `npm run test:media-pipeline` : 100/100
- Tests cibles publication mixte / original video : tous reussis
