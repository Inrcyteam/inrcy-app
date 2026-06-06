# YouTube Shorts — Étape 1 OAuth

Cette étape rend la connexion YouTube Shorts réelle.

## Routes ajoutées

- `GET /api/integrations/youtube-shorts/start`
- `GET /api/integrations/youtube-shorts/callback`
- `GET /api/integrations/youtube-shorts/status`
- `POST /api/integrations/youtube-shorts/disconnect`

## Variables serveur

Réutilise le projet Google existant :

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXT_PUBLIC_SITE_URL`
- `INRCY_CREDENTIALS_SECRET`

Optionnel si tu veux forcer une URL précise :

- `YOUTUBE_SHORTS_REDIRECT_URI`
- ou `GOOGLE_YOUTUBE_SHORTS_REDIRECT_URI`

URI de callback à ajouter dans Google Cloud :

```txt
https://app.inrcy.com/api/integrations/youtube-shorts/callback
```

En local/tunnel, ajouter aussi l'URL correspondante du tunnel.

## Scopes demandés

Par défaut :

- `https://www.googleapis.com/auth/youtube.upload`
- `https://www.googleapis.com/auth/youtube.readonly`
- `https://www.googleapis.com/auth/yt-analytics.readonly`
- `https://www.googleapis.com/auth/userinfo.email`

Tu peux surcharger avec :

- `YOUTUBE_SHORTS_SCOPES`
- ou `GOOGLE_YOUTUBE_SHORTS_SCOPES`

## Stockage

La connexion est stockée dans `integrations` avec :

- `provider = youtube`
- `category = social`
- `source = youtube_shorts`
- `product = youtube_shorts`

Les tokens sont chiffrés avec `encryptToken`.

`pro_tools_configs.settings.youtube_shorts` est aussi synchronisé pour que le Dashboard reste instantané.

## Ce que cette étape ne fait pas encore

- Publication réelle d'une vidéo dans Booster.
- Stats YouTube Analytics réelles dans iNrStats.
- Affichage complet dans iNrSend.

Ces points arrivent dans les étapes suivantes.
