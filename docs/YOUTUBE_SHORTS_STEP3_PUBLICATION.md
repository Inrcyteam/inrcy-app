# YouTube Shorts — Étape 3 : publication réelle Booster

Cette étape remplace la publication simulée YouTube Shorts par un upload réel via l'API YouTube Data v3.

## Comportement

- YouTube Shorts doit être connecté via OAuth réel.
- Le canal YouTube Shorts accepte uniquement le mode vidéo.
- Durée sécurisée côté serveur : maximum 180 secondes.
- La vidéo utilisée est la variante vidéo déjà préparée pour le canal, si elle existe.
- L'upload se fait via `videos.insert` en mode resumable.
- Le résultat renvoie l'ID vidéo et l'URL Shorts.

## Fichiers modifiés

- `app/api/booster/publish-now/route.ts`
- `lib/youtubeShortsOAuth.ts`
- `lib/youtubeShortsPublish.ts`

## Variables attendues

Identiques à l'étape OAuth :

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXT_PUBLIC_SITE_URL`
- `INRCY_CREDENTIALS_SECRET`

## Attention Google

Tant que l'application YouTube API n'est pas auditée/validée par Google, l'upload peut être limité selon l'état du projet Google et des scopes.
