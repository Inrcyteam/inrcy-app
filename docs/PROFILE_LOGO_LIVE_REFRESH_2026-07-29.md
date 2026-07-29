# Actualisation immédiate du logo — 29 juillet 2026

## Comportement

- Un logo ajouté ou remplacé dans **Mon profil** reçoit une URL versionnée.
- Le dashboard recharge immédiatement les données utilisées par **iNr'Badge**.
- Le cache public de **iNr'Search** est invalidé après chaque enregistrement du profil.
- L'icône et le manifeste iNr'Badge utilisent la même version du logo.
- Les anciennes URL non versionnées ne sont plus mises en cache durablement.

## Nettoyage

- Suppression des deux anciens chemins d'upload de logo devenus inutilisés.
- Suppression de l'ancien helper d'URL signée qui ne servait plus.
- Le système de stabilité de la barre de puissance reste l'unique chemin actif ; aucun ancien calcul concurrent n'est conservé.

## Contrôles

- Tests ciblés du versionnage et de l'actualisation du logo.
- Tests de non-régression de la barre de puissance.
