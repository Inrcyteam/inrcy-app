# Pinterest officiel en Production + Video Pins — 27 juillet 2026

## Etat final

- L'API Pinterest utilise uniquement `https://api.pinterest.com`.
- Pinterest est actif par defaut dans Bubble Access pour les comptes existants et futurs.
- Booster publie une image ou une video Pinterest dans le tableau choisi.
- iNrAgent conserve Pinterest dans les publications video immediates et programmees.
- iNrSend sait remplacer une epingle video lors d'une modification et supprimer l'ancienne.
- Les Video Pins suivent le protocole Pinterest : enregistrement du media, upload multipart, attente du traitement, puis creation du Pin.
- Une image de couverture publique est utilisee si elle existe ; sinon iNrCy extrait automatiquement une image de la video et l'enregistre dans le bucket `booster`.
- Les videos WebM sont converties en MP4 avant l'envoi. Les routes concernees embarquent FFmpeg sur Vercel.

## Deploiement

1. Deployer le ZIP sur Vercel avec les variables Pinterest de Production.
2. Executer `ops/sql/2026-07-27_app_bubble_access_pinterest_enabled.sql` dans Supabase.
3. Executer `ops/sql/2026-07-27_pinterest_production_cutover.sql` si une connexion Pinterest avait ete creee pendant la phase Sandbox.
4. Reconnecter Pinterest depuis **Canaux** si l'application le demande.
5. Faire un test reel avec une image, puis un test reel avec une video.

`PINTEREST_API_ENV` n'est plus necessaire. Si elle existe encore, sa seule valeur acceptee est `production`.

## Validation locale incluse

- `npm run qa:pinterest`
- `npm run test:pinterest`
- `node --test tests/booster-image-decision/booster-image-agent-inrsend-integration.test.mjs`
- `npm run test:media-rules`

Les tests de protocole utilisent des reponses Pinterest simulees. Un test reel necessite un compte Pinterest connecte et les secrets de Production deployes.
