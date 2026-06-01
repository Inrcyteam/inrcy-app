# Vidéo — Étape 7 : publication avec les variantes finales

Cette étape branche les variantes vidéo générées dans la publication réelle par canal.

## Comportement attendu

- Le pro ajoute une seule vidéo source.
- Booster prépare les variantes nécessaires selon les canaux sélectionnés.
- Au moment de publier, chaque canal reçoit sa variante finale :
  - TikTok / Instagram / Facebook : par défaut 9:16 si choisi.
  - LinkedIn : par défaut 1:1 si choisi.
  - Sites / Google Business : original ou format choisi.
- Les variantes identiques sont réutilisées : une seule vidéo 9:16 peut servir à plusieurs canaux.

## Payloads conservés

L'API `/api/booster/publish-now` conserve maintenant :

- `video` : la vidéo source avec ses variantes.
- `videoByChannel` : la vidéo finale réellement utilisée par chaque canal vidéo.
- `postByChannel[channel].video` : la vidéo finale du canal.
- `postByChannel[channel].sourceVideo` : la vidéo source.
- `postByChannel[channel].videoSettings` : format + mode d'adaptation.

## Objectif

Ce que le pro publie par canal correspond à la vidéo finale préparée, et iNrSend peut ensuite afficher le bon fichier utilisé par canal.
