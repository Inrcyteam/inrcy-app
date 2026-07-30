# iNrCy — Hotfix préparation vidéo serveur

Date : 30 juillet 2026

## Symptôme

- upload TUS vidéo terminé ;
- passage à 25 % avec `Préparation des médias sur le serveur 0%` ;
- aucune progression visible pendant le traitement FFmpeg.

## Causes corrigées

1. Le client attendait la réponse longue de `/api/media-pipeline/workspace/prepare`
   avant de relire le registre. La progression enregistrée par le worker n’était
   donc pas affichée pendant l’encodage.
2. Le déclenchement immédiat utilisait le claim global de la file vidéo. Il
   pouvait traiter un ancien job prioritaire au lieu du média du workspace
   actuellement ouvert.

## Correctif

- déclenchement du worker en parallèle du polling du registre ;
- une seule requête de préparation longue à la fois ;
- relance espacée de 12 secondes, compatible avec la limite de la route ;
- claim ciblé par `account_id`, `media_id` et `job_type` ;
- conservation du cron vidéo comme filet de reprise ;
- remontée des erreurs terminales, des flags désactivés et des échecs
  temporaires persistants ;
- maintien de la réparation des uploads déjà présents dans Storage ;
- aucune modification SQL et aucune nouvelle variable d’environnement.

## Résultat attendu

Après 25 %, la progression du registre doit continuer à être lue pendant le
traitement : démarrage du worker, téléchargement de la source, encodage,
création des dérivés et finalisation. La vidéo ciblée est traitée en priorité.
