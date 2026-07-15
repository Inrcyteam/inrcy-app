# Booster / Publier - Lot 2 - Préparation anticipée des photos IA

## Objectif

Retirer du chemin critique de la génération la conversion des photos vers le payload utilisé par l'IA, sans modifier les fichiers, leurs dimensions, leur qualité JPEG, leur ordre ni les règles de génération.

## Implémentation

- Préparation de `fileToBoosterAiImagePayload` dès que la liste des photos sélectionnées change.
- Cache local par fichier avec la clé existante `makeImageKey(file)` (`name + size + lastModified`).
- Cache de promesses afin d'éviter les doubles conversions, y compris en React Strict Mode ou lors d'un clic pendant la préparation.
- Réutilisation du même payload au clic sur Générer et lors des régénérations.
- Suppression automatique des entrées correspondant aux photos retirées.
- Nettoyage complet à la fermeture de la modale.
- En cas d'échec du préchauffage, suppression de l'entrée défaillante puis nouvelle tentative au clic avec le comportement de secours existant.

## Invariants de qualité

Aucune modification de :

- `BOOSTER_AI_IMAGE_MAX_SIDE` (1280),
- `BOOSTER_AI_IMAGE_JPEG_QUALITY` (0.76),
- nombre et ordre des photos,
- fonction de conversion,
- payload envoyé à l'API,
- prompts, moteurs, contrôles ou réparations.
