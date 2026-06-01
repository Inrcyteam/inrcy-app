# Moteur vidéo iNrCy — étape 3

Cette étape ajoute le moteur local de transformation vidéo.

## Route interne

`POST /api/booster/video-transform`

Entrée minimale :

```json
{
  "source": {
    "storagePath": "user/booster-videos/source.mp4",
    "publicUrl": "https://.../source.mp4",
    "duration": 24,
    "sourceMetadata": { "width": 1920, "height": 1080, "duration": 24 }
  },
  "variants": [
    { "key": "tiktok-9-16", "channel": "tiktok", "format": "9_16", "adaptationMode": "safe_blur" },
    { "key": "linkedin-1-1", "channel": "linkedin", "format": "1_1", "adaptationMode": "cover_crop" }
  ]
}
```

## Formats générés

- `9_16` → 1080×1920
- `1_1` → 1080×1080
- `16_9` → 1920×1080
- `original` → MP4 optimisé sans changement de cadre

## Modes

- `safe_blur` : fond flouté sécurisé, aucune zone utile coupée.
- `cover_crop` : recadrage plein écran, rendu plus immersif mais peut couper les bords.

## Important

Cette étape crée le moteur et la route. La génération automatique depuis Booster sera branchée à l’étape suivante.
