# Pinterest Standard - activation finale (27 juillet 2026)

Pinterest a approuve l'application iNrCy en acces Standard. L'integration applicative utilise maintenant exclusivement l'API de production `https://api.pinterest.com/v5`.

## Changements applicatifs

- Pinterest est active par defaut dans `APP_BUBBLE_DEFAULT_ACCESS`.
- Le provisioning applicatif des nouveaux comptes cree donc `pinterest=true`.
- Le fallback du panneau Pinterest est actif.
- Les publications image creent une epingle standard dans le tableau choisi.
- Les publications video suivent le flux officiel Pinterest : enregistrement du media, upload multipart, attente du traitement, puis creation du Video Pin avec `source_type=video_id`.
- Une image de couverture publique est utilisee quand elle existe ; sinon iNrCy extrait automatiquement une image de la video avec FFmpeg et l'enregistre dans le bucket `booster`.
- Les videos WebM sont converties en MP4 avant l'envoi Pinterest.
- Le code applicatif ne route plus vers l'API Sandbox.

## Migration Supabase

Executer :

`ops/sql/2026-07-27_app_bubble_access_pinterest_enabled.sql`

Cette migration :

1. cree les lignes Pinterest absentes pour tous les etablissements ;
2. passe uniquement les lignes `bubble_key='pinterest'` a `enabled=true` ;
3. remplace le trigger de provisioning afin que les futurs comptes recoivent Pinterest actif ;
4. conserve strictement `site_inrcy=false` par defaut.

## Configuration production a verifier dans Vercel

- `PINTEREST_CLIENT_ID`
- `PINTEREST_CLIENT_SECRET`
- `PINTEREST_REDIRECT_URI=https://app.inrcy.com/api/integrations/pinterest/callback`
- `PINTEREST_OAUTH_SCOPES=user_accounts:read,boards:read,boards:write,pins:read,pins:write`
- `INRCY_CREDENTIALS_SECRET`
- `NEXT_PUBLIC_APP_URL=https://app.inrcy.com`

`PINTEREST_API_ENV` n'est plus necessaire. Si la variable existe encore, elle doit rester a `production` ; toute valeur `sandbox` est refusee par le controle d'environnement.

## Validation

- `node scripts/qa-pinterest-standard.mjs`
- `npm run test:pinterest`
- `npm run verify:pinterest-env` dans un environnement possedant les variables Vercel

Le test unitaire simule le parcours complet register/upload/poll/create sans utiliser de jeton Pinterest reel. Une publication reelle doit ensuite etre effectuee sur un compte Pinterest connecte apres deploiement.
