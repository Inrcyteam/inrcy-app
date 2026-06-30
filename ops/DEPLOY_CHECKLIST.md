# Deploy checklist iNrCy

Checklist Go / No-Go pour déployer sans casser la version stable.

## 0. Version stable

- [ ] Créer ou identifier le tag / commit stable avant déploiement.
- [ ] Vérifier que le zip / dépôt ne contient pas `.env`, `.next`, `node_modules`.
- [ ] Vérifier que le changement ne touche pas une zone sensible sans Preview dédiée.

Zones sensibles :

- OAuth en cours de validation ;
- règles média multi-canaux ;
- accès admin ;
- CSP ;
- rate limiting fail-open / fail-closed ;
- migrations Supabase ;
- gros refactors React / API.

## 1. Avant deploy

- [ ] `npm ci` OK.
- [ ] `npm run typecheck` OK.
- [ ] `npm run lint` OK.
- [ ] `npm run test:media-rules` OK.
- [ ] `npm run test:multicompte` OK.
- [ ] `npm run verify:env` relu.
- [ ] Sentry reçoit bien les événements en Preview si test applicable.
- [ ] Supabase backups activés.
- [ ] Migrations appliquées en Preview / staging avant Production.
- [ ] Variables ajoutées dans Vercel Production + Preview si nécessaires.

Variables ops minimales :

- [ ] `HEALTHCHECK_TOKEN`
- [ ] `VERCEL_CRON_SECRET` ou `CRON_SECRET`
- [ ] `KV_REST_API_URL`
- [ ] `KV_REST_API_TOKEN`
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`

Pendant l'attente TikTok / Pinterest / Trustpilot :

- [ ] Ne pas forcer `STRICT=1` si les variables plateformes définitives ne sont pas encore disponibles.
- [ ] Ne pas modifier les redirect URIs OAuth déjà soumises en review sans nécessité.
- [ ] Ne pas retirer les routes ou pages nécessaires aux validations en cours.

## 2. Preview

- [ ] Déployer en Preview.
- [ ] Vérifier login.
- [ ] Vérifier dashboard.
- [ ] Vérifier statuts canaux.
- [ ] Vérifier Booster / Publier sans envoyer réellement si possible.
- [ ] Vérifier iNrAgent : ouverture, paramètres, aperçu.
- [ ] Vérifier iNrSend / Mails : liste et historique.
- [ ] Vérifier E-réputation : liste + détail.
- [ ] Vérifier iNrBadge public.
- [ ] Vérifier une page légale si elle a été modifiée.

## 3. Production

- [ ] Promouvoir / déployer en Production.
- [ ] Vérifier `GET /api/health` = 200.
- [ ] Vérifier `GET /api/health/internal` = 200 avec `x-health-token`.
- [ ] Vérifier `GET /api/cron/health?secret=...` = 200 si smoke manuel nécessaire.
- [ ] Vérifier Vercel Logs : pas de spike 5xx.
- [ ] Vérifier Sentry : pas de nouvelle erreur massive.
- [ ] Vérifier un compte réel : login + dashboard + ouverture d'un module.

## 4. Surveillance 10 minutes

- [ ] Auth OK.
- [ ] Dashboard OK.
- [ ] API principales sans erreur récurrente.
- [ ] Pas de plainte utilisateur bloquante.
- [ ] Pas de latence Supabase anormale.
- [ ] Pas de latence Upstash / KV anormale.

## 5. Rollback

Rollback si :

- 5xx persistants ;
- login ou dashboard cassé ;
- OAuth callbacks cassés pour plusieurs utilisateurs ;
- Supabase saturé ou timeouts répétés ;
- publication ou email bloqué pour plusieurs utilisateurs ;
- régression majeure visible côté client.

Process :

1. Vercel → Deployments → dernier déploiement stable → Redeploy.
2. Si une migration DB est impliquée, préférer une forward-fix migration documentée.
3. Noter l'incident dans le runbook ou une note courte.

## 6. Après incident

- [ ] Résumer en 10 lignes : date, impact, cause, correction, prévention.
- [ ] Ajouter un test, une alerte ou une checklist pour éviter la récidive.
