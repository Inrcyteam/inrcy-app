# iNrAgent — Lot B : préparation vidéo serveur

## Objectif

Permettre à iNrAgent de comprendre réellement une vidéo sélectionnée dans la médiathèque sans dépendre du navigateur Booster et sans bloquer la préparation automatique.

## Pipeline

1. téléchargement unique de la vidéo depuis Supabase Storage ;
2. écriture unique dans un dossier temporaire ;
3. lancement parallèle de :
   - l’extraction de trois captures JPEG légères ;
   - l’extraction d’une piste MP3 mono 16 kHz puis sa transcription via AI Gateway ;
4. transmission des captures et de la transcription au moteur rédactionnel partagé Booster ;
5. suppression systématique du dossier temporaire.

## Sécurité et résilience

- réservation du quota vidéo avant le premier appel de transcription ;
- limite source alignée sur la règle vidéo iNrCy de 100 Mo ;
- délais bornés pour téléchargement, FFmpeg et transcription afin de préserver la limite de 120 secondes ;
- aucune erreur média ne bloque la publication ;
- si l’audio échoue, les captures restent utilisables ;
- si les captures échouent, la transcription reste utilisable ;
- si les deux échouent, iNrAgent conserve son contexte métier et ses métadonnées actuelles.

## Périmètre

Ce lot prépare et utilise la vidéo pendant la génération iNrAgent. Il ne persiste pas encore durablement les captures et la transcription dans la médiathèque. Cette réutilisation inter-publications relève du Lot C.

## Nettoyage du test Trustpilot

Le test multicompte obsolète qui lisait une route Trustpilot supprimée a été retiré. Le contrôle e-réputation restant couvre uniquement Google.
