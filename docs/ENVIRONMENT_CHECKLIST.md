# Checklist variables d'environnement iNrCy

Ce fichier sert de suivi des variables nécessaires à iNrCy.

Ne jamais écrire les valeurs secrètes dans ce fichier. Conserver uniquement les noms, l'usage et le statut.

## Règle actuelle

Tant que TikTok, Pinterest et Trustpilot ne sont pas complètement disponibles / validés, le check d'environnement peut rester en non-strict :

```bash
STRICT=0 npm run verify:env
```

Quand toutes les intégrations sont prêtes en Production et Preview, il sera possible de passer progressivement en strict :

```bash
STRICT=1 npm run verify:env
```

## Core app

- [ ] `NEXT_PUBLIC_APP_URL`
- [ ] `NEXT_PUBLIC_SITE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`

## Supabase / auth / sécurité interne

- [ ] `INRCY_CREDENTIALS_SECRET`
- [ ] `INRCY_WIDGETS_SIGNING_SECRET`
- [ ] `INRCY_WIDGET_ALLOWED_ORIGINS`
- [ ] `SUPABASE_NEW_USER_WEBHOOK_SECRET`
- [ ] `INRCY_NEW_USER_ALERT_EMAIL`
- [ ] `INRCY_DIAGNOSTIC_REPORT_TO`
- [ ] `ADMIN_SECRET`
- [ ] `INRCY_ADMIN_USER_ID`
- [ ] `INRCY_ADMIN_GOOGLE_EMAIL`

## Health / cron / monitoring

- [ ] `HEALTHCHECK_TOKEN`
- [ ] `VERCEL_CRON_SECRET` ou `CRON_SECRET`
- [ ] `HEALTHCHECK_ALERT_TO`
- [ ] `SENTRY_DSN`
- [ ] `NEXT_PUBLIC_SENTRY_DSN`
- [ ] `SENTRY_AUTH_TOKEN`

## Upstash / Vercel KV

- [ ] `KV_REST_API_URL`
- [ ] `KV_REST_API_TOKEN`
- [ ] `DISABLE_UPSTASH` uniquement en besoin local contrôlé
- [ ] `ENABLE_UPSTASH_IN_DEV` uniquement en besoin local contrôlé

Limites optionnelles :

- [ ] `RL_BOOSTER_GENERATE_PER_MIN`
- [ ] `QUOTA_BOOSTER_GENERATE_PER_DAY`
- [ ] `RL_TEMPLATES_RENDER_PER_MIN`
- [ ] `QUOTA_TEMPLATES_RENDER_PER_DAY`
- [ ] `RL_PUBLISH_NOW_PER_MIN`
- [ ] `QUOTA_PUBLISH_NOW_PER_DAY`
- [ ] `RL_WIDGET_ISSUE_TOKEN_PER_MIN`
- [ ] `QUOTA_WIDGET_ISSUE_TOKEN_PER_DAY`

## Stripe

- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- [ ] `STRIPE_PRICE_STARTER_ID`
- [ ] `STRIPE_PRICE_YEARLY`
- [ ] `STRIPE_PRICE_ACCEL_ID`
- [ ] `STRIPE_PRICE_ACCEL_YEARLY_ID`
- [ ] `STRIPE_PRICE_SPEED_ID`
- [ ] `STRIPE_PRICE_FULL_ID`

## Mails transactionnels / iNrSend

- [ ] `TX_SMTP_HOST`
- [ ] `TX_SMTP_PORT`
- [ ] `TX_SMTP_USER`
- [ ] `TX_SMTP_PASS`
- [ ] `TX_MAIL_FROM`
- [ ] `INRSEND_MAIL_WEBHOOK_SECRET`
- [ ] `INRSEND_WEBHOOK_SECRET`
- [ ] `INRSEND_CAMPAIGN_BATCH_SIZE`
- [ ] `INRSEND_CAMPAIGN_HOURLY_LIMIT`
- [ ] `INRSEND_CAMPAIGN_DAILY_LIMIT`
- [ ] `INRSEND_CAMPAIGN_MAX_ACTIVE_PER_BOX`

## OpenAI / IA

- [ ] `OPENAI_API_KEY`
- [ ] `OPENAI_MODEL`
- [ ] `OPENAI_VISION_MODEL`
- [ ] `OPENAI_TRANSCRIBE_MODEL`
- [ ] `OPENAI_TRANSCRIPT_CLEANUP_MODEL`

## Google / Google Business / YouTube

- [ ] `GOOGLE_CLIENT_ID`
- [ ] `GOOGLE_CLIENT_SECRET`
- [ ] `GOOGLE_REDIRECT_URI`
- [ ] `GOOGLE_GMB_REDIRECT_URI`
- [ ] `GOOGLE_STATS_REDIRECT_URI`
- [ ] `GOOGLE_RISC_AUDIENCES`
- [ ] `GOOGLE_RISC_RECEIVER_ENABLED`
- [ ] `GOOGLE_YOUTUBE_SHORTS_CLIENT_ID`
- [ ] `GOOGLE_YOUTUBE_SHORTS_CLIENT_SECRET`
- [ ] `GOOGLE_YOUTUBE_SHORTS_REDIRECT_URI`
- [ ] `GOOGLE_YOUTUBE_SHORTS_SCOPES`
- [ ] `GOOGLE_YOUTUBE_CLIENT_ID`
- [ ] `GOOGLE_YOUTUBE_CLIENT_SECRET`
- [ ] `YOUTUBE_SHORTS_CLIENT_ID`
- [ ] `YOUTUBE_SHORTS_CLIENT_SECRET`
- [ ] `YOUTUBE_SHORTS_REDIRECT_URI`
- [ ] `YOUTUBE_SHORTS_SCOPES`
- [ ] `YOUTUBE_CLIENT_ID`
- [ ] `YOUTUBE_CLIENT_SECRET`

## Meta / Facebook / Instagram

- [ ] `FACEBOOK_APP_ID`
- [ ] `FACEBOOK_APP_SECRET`
- [ ] `FACEBOOK_REDIRECT_URI`
- [ ] `FACEBOOK_LOGIN_FOR_BUSINESS_CONFIG_ID`
- [ ] `INSTAGRAM_REDIRECT_URI`
- [ ] `INSTAGRAM_LOGIN_FOR_BUSINESS_CONFIG_ID`

## LinkedIn

- [ ] `LINKEDIN_CLIENT_ID`
- [ ] `LINKEDIN_CLIENT_SECRET`
- [ ] `LINKEDIN_REDIRECT_URI`
- [ ] `LINKEDIN_API_VERSION`
- [ ] `LINKEDIN_SCOPE_OVERRIDES`

## Microsoft / Outlook

- [ ] `MICROSOFT_CLIENT_ID`
- [ ] `MICROSOFT_CLIENT_SECRET`
- [ ] `MICROSOFT_REDIRECT_URI`

## TikTok — en attente selon validation plateforme

À compléter quand les accès définitifs sont disponibles.

- [ ] `TIKTOK_CLIENT_KEY`
- [ ] `TIKTOK_CLIENT_SECRET`
- [ ] `TIKTOK_REDIRECT_URI`
- [ ] `TIKTOK_SCOPES`
- [ ] `TIKTOK_MEDIA_BASE_URL`
- [ ] `TIKTOK_MEDIA_SIGNING_SECRET`

## Pinterest — en attente selon validation plateforme

À compléter quand les accès définitifs sont disponibles.

- [ ] `PINTEREST_CLIENT_ID`
- [ ] `PINTEREST_CLIENT_SECRET`
- [ ] `PINTEREST_REDIRECT_URI`
- [ ] `PINTEREST_OAUTH_SCOPES`
- [ ] `PINTEREST_APP_ID`
- [ ] `PINTEREST_APP_SECRET`

## Trustpilot — en attente selon validation plateforme

À compléter quand les accès définitifs sont disponibles.

- [ ] `TRUSTPILOT_CLIENT_ID`
- [ ] `TRUSTPILOT_CLIENT_SECRET`
- [ ] `TRUSTPILOT_REDIRECT_URI`
- [ ] `TRUSTPILOT_AUTHOR_BUSINESS_USER_ID`
- [ ] `TRUSTPILOT_API_KEY`
- [ ] `TRUSTPILOT_API_SECRET`

## E2E / tests

- [ ] `E2E_BASE_URL`
- [ ] `E2E_EMAIL`
- [ ] `E2E_PASSWORD`
- [ ] `E2E_ALLOW_WRITES`

## Divers

- [ ] `FFMPEG_PATH`
- [ ] `NEXTAUTH_SECRET`
- [ ] `NEXT_PUBLIC_BOUTIQUE_EMAIL`
- [ ] `NEXT_PUBLIC_INRBADGE_BASE_URL`
- [ ] `NEXT_PUBLIC_COMMIT_SHA`
- [ ] `VERCEL_GIT_COMMIT_SHA`
- [ ] `CRM_CAMPAIGN_MAX_RECIPIENTS`
