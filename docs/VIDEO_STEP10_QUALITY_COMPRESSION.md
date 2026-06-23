# Étape vidéo 10 — Compression et qualité

Cette étape rend les variantes vidéo plus opérationnelles pour la publication réelle.

## Objectif

Chaque variante générée par le moteur vidéo est maintenant encodée avec un profil qualité adapté au format final :

- 9:16 : qualité verticale optimisée
- 1:1 : qualité carrée optimisée
- 16:9 : qualité horizontale optimisée
- Original : original optimisé

## Réglages appliqués

Le moteur utilise FFmpeg avec :

- codec vidéo H.264 (`libx264`)
- pixel format `yuv420p` pour compatibilité réseaux sociaux
- audio AAC stéréo
- `+faststart` pour lecture web plus rapide
- CRF/bitrate/maxrate/bufsize adaptés au format
- limite de sortie à 40 Mo par variante, même si la vidéo source Booster peut aller jusqu'à 100 Mo

## Profils

| Format | Résolution cible | CRF | Bitrate vidéo | Maxrate | Audio |
|---|---:|---:|---:|---:|---:|
| 9:16 | 1080×1920 | 24 | 4200k | 5500k | 128k |
| 1:1 | 1080×1080 | 24 | 3600k | 4800k | 128k |
| 16:9 | 1920×1080 | 23 | 5000k | 6800k | 128k |
| Original | source optimisée | 23 | 5200k | 7000k | 128k |

## Comportement en cas de vidéo trop lourde

Si une variante reste au-dessus de 40 Mo après compression, elle est marquée en erreur avec un message clair demandant de réduire la durée de la vidéo ou de choisir un format plus léger.
