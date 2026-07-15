# iNrAgent — Lot C : contexte vidéo IA persistant

## Objectif

Éviter de télécharger, décoder et transcrire plusieurs fois la même vidéo de la médiathèque. Une première préparation produit le contexte IA ; les générations suivantes le réutilisent immédiatement.

## Données mémorisées dans `pro_media_library`

- `ai_status` : `ready`, `partial` ou `unavailable` ;
- `ai_transcript` : transcription nettoyée, limitée à 5 000 caractères ;
- `ai_frame_paths` : chemins privés des trois captures JPEG ;
- `ai_prepared_at` : date de préparation ;
- `ai_preparation_version` : version du pipeline ;
- `ai_source_fingerprint` : empreinte SHA-256 de la source ;
- `ai_warnings` : avertissements techniques bornés ;
- `ai_timings` : durées du téléchargement, des captures, de l'audio et de la transcription.

## Stockage des captures

Les captures sont conservées dans le bucket privé existant `inrcy-pro-media` :

```text
users/{userId}/ai/video/{mediaId}/v{version}/{fingerprint}/frame-01.jpg
```

Elles respectent donc les politiques Storage déjà basées sur le préfixe `users/{auth.uid()}/`.

## Réutilisation

Lorsqu'iNrAgent sélectionne une vidéo :

1. lecture de la ligne de médiathèque appartenant à l'établissement actif ;
2. comparaison de la version et de l'empreinte ;
3. si le cache est valide, téléchargement des trois petites captures et réutilisation directe de la transcription ;
4. sinon, exécution du pipeline Lot B puis persistance du nouveau résultat.

Une préparation `unavailable` est conservée six heures afin d'éviter des tentatives coûteuses en boucle. Elle est ensuite retentée automatiquement.

## Invalidation et nettoyage

- changement de version du pipeline : nouvelle préparation ;
- changement de chemin, taille, durée ou type MIME de la source : nouvelle préparation ;
- captures manquantes dans Storage : réparation par nouvelle préparation ;
- remplacement du contexte : suppression des anciennes captures après validation du nouveau contexte ;
- suppression du média : suppression de la vidéo source et de ses captures IA dérivées.

## Compatibilité de déploiement

La migration à exécuter est :

```text
ops/sql/2026-07-15_inragent_video_ai_context_cache.sql
```

Si le code est déployé avant la migration, iNrAgent conserve temporairement le comportement Lot B : préparation à la demande, sans persistance et sans blocage.

## Données non persistées

- aucune image Base64 dans la base ;
- aucun fichier audio temporaire ;
- aucune copie de la vidéo source ;
- aucun secret ou contenu de prompt.
