# Vidéo — Étape 4 : génération intelligente des variantes

Objectif : lorsqu'une publication contient une vidéo, Booster prépare uniquement les versions réellement nécessaires selon les canaux sélectionnés et les réglages vidéo choisis.

## Fonctionnement

1. La vidéo source est uploadée une seule fois.
2. Booster lit les canaux en mode vidéo.
3. Booster déduplique les variantes par signature :
   - format (`9_16`, `1_1`, `16_9`, `original`)
   - adaptation (`safe_blur`, `cover_crop`)
4. L'API interne `/api/booster/video-transform` génère uniquement les variantes uniques.
5. Chaque canal reçoit ensuite la variante correspondant à son format/adaptation.
6. iNrSend conserve la vidéo réellement utilisée par canal.

Exemple :
- TikTok 9:16 + Instagram 9:16 + Facebook 9:16 = 1 seule variante 9:16 générée.
- LinkedIn 1:1 = 1 variante 1:1 générée.
- Site web original = 1 variante original optimisée.

## Pré-requis local

FFmpeg et FFprobe doivent être installés sur la machine de dev pour que la transformation vidéo fonctionne.

## Limite actuelle

L'aperçu peut encore utiliser la simulation en direct selon le flux UI. L'étape suivante consiste à brancher les vraies variantes générées dans l'aperçu avant publication.
