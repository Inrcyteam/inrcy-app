# Stabilisation iNrCy - Etape 2

Date : 2026-06-21

Objet : inventaire de configuration externe, securite et restauration.

Regle de l'etape : aucune modification en production, aucune modification du code, aucune valeur de secret copiee dans ce document.

## Sources analysees

- Archive source propre creee en etape 1 : `inrcy-stable-prod-2026-06-21-source.zip`
- Verification locale precedente : typecheck OK, lint OK
- Capture app iNrCy dashboard production
- Captures Vercel des variables d'environnement
- Captures GitHub Actions secrets
- Captures Supabase Auth : Policies, URL Configuration, Rate Limits
- Fichiers du code : `scripts/verify-env.mjs`, `.github/workflows/ci.yml`, scan des usages `process.env`

## Etat de reference observe

- L'application production est active.
- Le dashboard iNrCy affiche 10 integrations connectees sur 10 disponibles.
- Les zones visibles du dashboard indiquent une activite normale : generateur lance, canaux connectes, modules accessibles.
- Les secrets ne sont pas visibles dans les captures Vercel/GitHub, uniquement leurs noms.
- Le point stable source de l'etape 1 reste la base de retour arriere.

## Vercel - variables d'environnement

Les variables requises par `scripts/verify-env.mjs` sont observees dans Vercel, d'apres les captures :

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `HEALTHCHECK_TOKEN`
- `INRCY_WIDGETS_SIGNING_SECRET`
- `INRCY_CREDENTIALS_SECRET`
- `TX_SMTP_HOST`
- `TX_SMTP_PORT`
- `TX_SMTP_USER`
- `TX_SMTP_PASS`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRICE_STARTER_ID`
- `STRIPE_PRICE_YEARLY`
- `STRIPE_PRICE_ACCEL_ID`
- `STRIPE_PRICE_ACCEL_YEARLY_ID`

Groupe requis :

- `CRON_SECRET` est observe dans Vercel.
- `VERCEL_CRON_SECRET` n'est pas vu dans les captures, mais le script accepte `CRON_SECRET` ou `VERCEL_CRON_SECRET`.

Variables recommandees observees :

- `ADMIN_SECRET`
- `SUPABASE_NEW_USER_WEBHOOK_SECRET`
- `INRCY_NEW_USER_ALERT_EMAIL`
- `INRCY_TRIAL_SIGNUP_SECRET`
- `TX_MAIL_FROM`
- `STRIPE_PRICE_SPEED_ID`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_GMB_REDIRECT_URI`
- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- `FACEBOOK_REDIRECT_URI`
- `INSTAGRAM_REDIRECT_URI`
- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `LINKEDIN_REDIRECT_URI`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_REDIRECT_URI`
- `TIKTOK_CLIENT_KEY`
- `TIKTOK_CLIENT_SECRET`
- `TIKTOK_REDIRECT_URI`

Variables a confirmer plus tard, sans action immediate :

- `STRIPE_PRICE_FULL_ID`
- `GOOGLE_STATS_REDIRECT_URI`
- `HEALTHCHECK_ALERT_TO`
- `GOOGLE_YOUTUBE_CLIENT_ID`
- `GOOGLE_YOUTUBE_CLIENT_SECRET`
- `GOOGLE_YOUTUBE_SHORTS_CLIENT_ID`
- `GOOGLE_YOUTUBE_SHORTS_CLIENT_SECRET`
- `GOOGLE_YOUTUBE_SHORTS_REDIRECT_URI`
- `NEXTAUTH_SECRET`
- `NEXT_PUBLIC_INRBADGE_BASE_URL`
- `TIKTOK_MEDIA_SIGNING_SECRET`
- `INRSEND_WEBHOOK_SECRET`

Conclusion Vercel : ne rien modifier maintenant. L'etat semble coherent pour la production. La prochaine action sure est seulement de completer l'inventaire.

## GitHub Actions - secrets

Les secrets GitHub sont configures au niveau repository. Aucun secret d'environnement GitHub n'est visible dans les captures.

Secrets repository observes :

- `CRON_SECRET`
- `E2E_EMAIL`
- `E2E_PASSWORD`
- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `HEALTHCHECK_TOKEN`
- `INRCY_CREDENTIALS_SECRET`
- `INRCY_NEW_USER_ALERT_EMAIL`
- `INRCY_TRIAL_SIGNUP_SECRET`
- `INRCY_WIDGETS_SIGNING_SECRET`
- `KV_REST_API_TOKEN`
- `KV_REST_API_URL`
- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `OPENAI_API_KEY`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_DSN`
- `STRIPE_PRICE_ACCEL_ID`
- `STRIPE_PRICE_ACCEL_YEARLY_ID`
- `STRIPE_PRICE_SPEED_ID`
- `STRIPE_PRICE_STARTER_ID`
- `STRIPE_PRICE_YEARLY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_NEW_USER_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TIKTOK_CLIENT_KEY`
- `TIKTOK_CLIENT_SECRET`
- `TX_MAIL_FROM`
- `TX_SMTP_HOST`
- `TX_SMTP_PASS`
- `TX_SMTP_PORT`
- `TX_SMTP_USER`

Point de prudence :

- Le CI lance la verification des variables en mode non strict : `STRICT: "0"`.
- Passer en strict ferait echouer le CI si une variable manque. Ce n'est pas a faire tant que l'inventaire n'est pas complet.
- Action sure maintenant : comparer et documenter. Action plus tard : rendre le controle plus strict seulement apres confirmation de toutes les variables.

## Supabase Auth - URL Configuration

Configuration observee :

- Site URL : `https://app.inrcy.com`
- Redirect URLs :
  - `https://app.inrcy.com/*`
  - `https://app.inrcy.com/login`
  - `http://localhost:3000/*`
  - `http://localhost:3000/login`
  - `https://app.inrcy.com/auth/callback`
  - `https://app.inrcy.com/set-password`
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/set-password`

Conclusion : ne pas supprimer le wildcard `https://app.inrcy.com/*` maintenant. Il peut etre utile au fonctionnement actuel. On le reverra plus tard avec les parcours de connexion.

## Supabase Auth - Rate Limits

Valeurs observees :

- Emails : 30 par heure
- SMS : 30 par heure
- Token refreshes : 150 requetes par 5 minutes par IP
- Token verifications : 30 requetes par 5 minutes par IP
- Anonymous users : 30 par heure par IP
- Sign-ups / sign-ins : 30 requetes par 5 minutes par IP
- Web3 sign-ups / sign-ins : 30 requetes par 5 minutes par IP
- IP address forwarding : desactive

Conclusion : ne pas changer ces limites maintenant. Elles protegent deja l'application contre les abus. Toute modification doit etre liee a des symptomes reels.

## Supabase Policies / RLS

Etat general observe :

- De nombreuses tables ont RLS active.
- La plupart des politiques visibles sont des regles "own data" appliquees aux utilisateurs authentifies.
- Certaines tables affichent "API disabled", ce qui reduit l'exposition via l'API.
- Certaines tables ont RLS active mais aucune policy, donc aucune donnee ne remonte via la Data API.

Points a revoir plus tard, sans action immediate :

- Certaines policies sont appliquees a `public` mais semblent contenir une logique "own user". A verifier dans le SQL avant toute modification.
- Certaines tables sans policy peuvent etre volontairement reservees au serveur. A verifier avant d'ajouter des policies.
- Exemples a regarder plus tard : `app_bubble_access`, `inr_agent_actions`, `inr_agent_settings`, `instagram_action_logs`, `inrcy_diagnostic_reports`, `inrcy_image_bank`, `invoice_number_counters`, `mail_provider_events`, `widget_domain_registry`, `security_events_google`.

Conclusion : RLS est globalement en place. Ne pas modifier les policies depuis le dashboard sans export SQL et test en Preview.

## Ce qui est deja fait sans risque

- Point stable source cree en etape 1.
- Empreinte SHA-256 creee pour verifier l'archive source.
- Inventaire Vercel/GitHub/Supabase commence sans copier les valeurs secretes.
- Verification que les variables essentielles attendues par le script existent dans Vercel.
- Identification des zones a auditer plus tard, sans changement live.

## Prochaines pieces a recuperer

A fournir si possible, sous forme de captures ou exports sans valeurs secretes :

- Supabase Database > Backups : statut, retention, dernier backup.
- Supabase Storage > Buckets : liste des buckets et visibilite public/private.
- Supabase Storage > Policies : policies des buckets si presentes.
- Vercel Deployments : dernier deploy production reussi et commit associe.
- Vercel Domains : domaines connectes et domaine principal.
- Stripe Webhooks : endpoint URL et liste des events, sans afficher le signing secret.
- Upstash / Vercel KV : nom de la base, region, plan, sans token.
- Google / Meta / LinkedIn / TikTok / Microsoft OAuth : redirect URLs configurees.
- Sentry : projet, DSN public, alertes principales, sans token.

## Ordre conseille pour la suite

1. Completer l'inventaire des backups Supabase et Storage.
2. Rediger une procedure de restauration simple : source, env, base, storage, deploy.
3. Comparer Vercel et GitHub secrets variable par variable.
4. Corriger uniquement la documentation ou les checks non bloquants.
5. Reporter les changements sensibles : RLS, rate limits, Auth redirects, CI strict, CSP, fail-closed.

## Regle de protection

Tant que tout fonctionne bien, on stabilise d'abord par observation, inventaire et capacite de retour arriere. Les changements de securite qui peuvent modifier le comportement client ou serveur doivent passer plus tard par une branche, une Preview Vercel et un test de parcours complet.
