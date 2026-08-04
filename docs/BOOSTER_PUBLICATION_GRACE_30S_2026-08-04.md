# Booster - bilan de publication a 30 secondes - 2026-08-04

## Objectif UX

Laisser suffisamment de temps aux canaux ordinaires pour rendre un bilan utile, sans bloquer le professionnel pendant plusieurs minutes.

## Regle finale

- tous les canaux termines avant 30 secondes : bilan affiche immediatement ;
- canaux encore actifs a 30 secondes : bilan affiche avec les resultats deja acquis ;
- seuls les canaux reellement inacheves restent en traitement dans la modale et iNrSend ;
- le worker durable et les crons continuent le suivi en arriere-plan.

Exemple attendu pour dix canaux : huit publies et deux en traitement, plutot que dix canaux affiches trop tot en traitement.

## Synchronisation visuelle

La progression 74-98 % est alignee sur la meme fenetre de 30 secondes. Elle reste progressive jusqu'au bilan et passe immediatement a 100 % des que tous les canaux sont termines.

## Non-regression

Les tests couvrent :

- sortie anticipee lorsque tous les canaux terminent en trois secondes ;
- attente exacte de 30 secondes avec conservation d'un bilan huit succes / deux en traitement ;
- poursuite automatique en arriere-plan apres liberation de l'editeur.
