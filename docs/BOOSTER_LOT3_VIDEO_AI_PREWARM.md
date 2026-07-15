# Booster / Publier - Lot 3 - Préparation anticipée de la vidéo IA

## Objectif

Retirer du chemin critique de la génération l'extraction des trois captures vidéo et exécuter cette extraction en parallèle de la transcription, sans modifier la qualité, les positions temporelles, les prompts ni les règles éditoriales.

## Implémentation

- Préparation de `extractVideoFramesForAI` dès qu'une vidéo valide est sélectionnée.
- Cache local de promesse par fichier avec la clé `name + size + lastModified`.
- Réutilisation de la même extraction si le professionnel clique pendant le préchauffage.
- Réutilisation des trois captures lors des régénérations avec la même vidéo.
- Suppression du cache lorsque la vidéo est retirée, remplacée, réinitialisée ou lorsque la modale est fermée.
- En cas d'échec du préchauffage, suppression de l'entrée puis nouvelle tentative au clic avec le fallback existant.
- Transcription audio et récupération des captures exécutées avec `Promise.allSettled`.
- Vérification client de la limite de transcription de 40 Mo déjà appliquée côté serveur, afin d'éviter un téléversement inutile.

## Invariants de qualité

Aucune modification de :

- `buildVideoFrameCapturePlan`,
- positions début / milieu / fin,
- dimension maximale de 1280 px,
- qualité JPEG de 0.76,
- transcription, correction ou timeout,
- payload `videoForAI`,
- prompts, moteurs, contrôles ou réparations.
