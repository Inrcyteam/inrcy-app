# Booster Publier - Etape 3 - Deux parcours complets

Date : 2026-08-04
Base : `inrcy-app-48-etape2-pipeline-media`

## Objectif

Mettre en place deux parcours utilisateur complets et réellement isolés, tout en conservant un seul workspace média et un seul moteur final de publication.

## Parcours Créer avec iNrCy

1. Canaux
2. Choix du mode Créer avec iNrCy
3. Intention, consigne et média facultatif
4. Génération
5. Contenus générés par canal
6. Médias de la publication
7. Publication ou programmation

Le média ajouté avant la génération est conservé dans le workspace et réutilisé ensuite sans nouvel upload. Un média peut également être ajouté seulement après la génération.

Les images ne sont préparées pour l'IA que lorsque le professionnel active leur utilisation. Une vidéo présente dans le parcours IA peut déclencher la préparation IA dédiée de l'étape 2.

## Parcours Créer manuellement

1. Canaux
2. Choix du mode Créer manuellement
3. Textes par canal
4. Médias de la publication
5. Publication ou programmation

Ce parcours n'appelle jamais la génération, l'aperçu IA, les captures vidéo IA, l'audio ou la transcription.

## Protections ajoutées

- La route `/api/booster/generate` refuse explicitement `creationMode: "manual"`.
- Le hook workspace refuse une mission `ai_preparation` hors du mode IA.
- Le workspace n'est consommé par l'IA que lorsque `useWorkspaceMediaForAI` est explicitement actif.
- Le mode IA sans média ne bloque plus sur une préparation workspace inutile.
- Une image décochée pour l'IA reste disponible pour la publication, sans être analysée.
- Les médias communs et les canaux restent conservés lors d'un changement de mode.
- Les blocs sont numérotés dynamiquement selon le parcours.
- Le moteur final Publier / Programmer reste unique.

## Contrôles réalisés

- Tests dédiés Etape 3 : 13/13.
- Tests dashboard : 125/125.
- Tests missions média Etape 2 : 7/7.
- Tests workspace progressif : 5/5.
- Tests règles média : 4/4.
- Tests Pinterest : 21/21.
- Tests sécurité des contenus Booster : 13/13.
- Pipeline média : 96/97 ; le seul test rouge est le test TikTok historique déjà rouge dans la base Etape 2.
- Vérification de syntaxe TypeScript des fichiers modifiés : réussie.
- `git diff --check` : réussi.

## Limite de l'environnement de contrôle

L'installation complète des dépendances est bloquée par le registre npm interne qui ne fournit pas l'archive `zod-validation-error-4.0.2.tgz`. Le typecheck, le lint et le build complets nécessitant les dépendances ne peuvent donc pas être exécutés dans cet environnement.
