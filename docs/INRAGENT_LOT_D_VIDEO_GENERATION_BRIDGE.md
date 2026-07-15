# iNrAgent — Lot D : pont de génération vidéo partagé

## Objectif

Garantir que les captures et la transcription produites par les Lots B/C arrivent jusqu'au moteur final Booster sans être mélangées avec les consignes techniques de l'automatisation.

## Séparation des contextes

Le moteur partagé accepte désormais deux champs distincts :

- `mediaContext` : transcription, métadonnées et compréhension visuelle ;
- `extraInstructions` : règles d'exécution propres à Booster, iNrAgent ou à une réparation.

Cette séparation est conservée pendant :

1. la construction du profil de génération ;
2. l'analyse visuelle directe ou neutre ;
3. l'appel multicanal principal ;
4. l'unique réparation ciblée éventuelle ;
5. la compilation finale du prompt.

Le contexte média dispose ainsi de sa propre enveloppe de 5 000 caractères et les instructions d'exécution de leur propre enveloppe de 2 000 caractères. La transcription n'est plus compactée avec le texte technique iNrAgent.

## Fallbacks vidéo

Chaque préparation iNrAgent expose un mode explicite :

- `full` : captures et transcription ;
- `visual_only` : captures uniquement ;
- `audio_only` : transcription uniquement ;
- `metadata_only` : métadonnées uniquement.

Aucun de ces modes ne bloque la génération. Le mode utilisé est enregistré dans la trace de l'action, sans persister les images Base64 ni dupliquer la transcription dans le brouillon.

## Compatibilité partagée

Booster / Publier manuel et la route de QA utilisent également `mediaContext`. Le comportement rédactionnel reste partagé, tandis que les consignes propres à chaque outil restent séparées.
