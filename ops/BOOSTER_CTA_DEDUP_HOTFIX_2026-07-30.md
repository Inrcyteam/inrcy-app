# Correctif Booster — déduplication CTA et coordonnées

Date : 30 juillet 2026

## Objectif

Éviter qu'un téléphone, une URL, un appel à l'action ou un hashtag apparaisse plusieurs fois dans une publication lorsque l'information est à la fois générée dans le contenu et gérée par les champs structurés de Booster.

## Protections ajoutées

- reconnaissance d'un même numéro malgré les formats `06 11 65 60 52`, `06.11.65.60.52`, `0611656052` ou `+33 6 11 65 60 52` ;
- suppression de la coordonnée déjà présente dans le titre, le contenu ou le libellé du CTA avant assemblage final ;
- affichage unique et lisible du téléphone dans le CTA ;
- suppression des URL structurées déjà répétées dans le contenu ou le CTA ;
- déduplication des hashtags, y compris lorsque l'IA les a déjà insérés dans le contenu ;
- même logique entre prévisualisation, publication immédiate, programmation et republication depuis iNrSend ;
- nettoyage final renforcé pour Google Business : aucun téléphone, e-mail, URL ou hashtag dans le résumé ;
- consignes IA renforcées afin que les coordonnées restent dans les champs CTA dédiés.

## Vérifications

- 13 tests ciblés du correctif réussis ;
- 8 tests de non-régression Booster/IA existants réussis ;
- contrôle de syntaxe TypeScript réussi sur tous les fichiers modifiés.

Le build/typecheck complet n'a pas pu être relancé dans l'environnement d'analyse, car le ZIP ne contient pas `node_modules` et le registre de dépendances n'était pas disponible. Aucun package, SQL, variable d'environnement, média, connexion de canal ou design n'a été modifié.
