# iNrCy — Mise en production du pipeline média universel

Date : 29 juillet 2026

Cette procédure est conçue pour être suivie dans l'ordre. Les migrations sont
additives. Les retours arrière se font par flags, jamais par suppression SQL.

## Avant de commencer

- conserver le déploiement Vercel actuellement stable ;
- sauvegarder les variables d'environnement existantes ;
- vérifier Sentry, les logs Vercel et le cron `/api/cron/health` ;
- choisir un compte iNrCy interne pour le canary ;
- ne pas modifier les limites Storage pendant la bascule.

## Phase 1 — Déployer le code sans activation

Déployer le ZIP final avec tous les flags suivants absents ou à `false` :

```text
MEDIA_PIPELINE_UPLOADS_V1=false
MEDIA_PIPELINE_WORKSPACE_V1=false
MEDIA_PIPELINE_IMAGE_NORMALIZATION_V1=false
MEDIA_PIPELINE_VIDEO_NORMALIZATION_V1=false
MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1=false
MEDIA_PIPELINE_LEGACY_CUTOVER_V1=false
NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1=false
NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1=false
NEXT_PUBLIC_MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1=false
NEXT_PUBLIC_MEDIA_PIPELINE_LEGACY_CUTOVER_V1=false
```

Résultat attendu : `npm run verify:media-pipeline:rollout` indique `disabled`.

## Phase 2 — Appliquer le socle Supabase

Exécuter dans cet ordre, uniquement si la migration concernée n'a pas déjà été
appliquée :

1. `ops/sql/20260625_pro_media_library.sql`
2. `ops/sql/2026-07-29_media_pipeline_step2_universal_registry.sql`
3. `ops/sql/2026-07-29_media_pipeline_step3_universal_direct_upload.sql`
4. `ops/sql/2026-07-29_media_pipeline_step5_image_normalization.sql`
5. `ops/sql/2026-07-29_media_pipeline_step6_video_normalization.sql`
6. `ops/sql/2026-07-29_media_pipeline_step7_unified_consumption.sql`
7. `ops/sql/2026-07-29_media_pipeline_step8_legacy_cutover.sql`

L'Étape 4 ne possède pas de migration d'écriture.

Exécuter ensuite les vérifications Étapes 2 à 8, puis :

```text
ops/sql/2026-07-29_media_pipeline_step9_final_certification.sql
```

Tous les objets attendus doivent être présents et `inrcy-pro-media` doit être
privé.

## Phase 3 — Socle serveur

Activer :

```text
MEDIA_PIPELINE_UPLOADS_V1=true
MEDIA_PIPELINE_WORKSPACE_V1=true
MEDIA_PIPELINE_IMAGE_NORMALIZATION_V1=true
MEDIA_PIPELINE_VIDEO_NORMALIZATION_V1=true
MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1=false
MEDIA_PIPELINE_LEGACY_CUTOVER_V1=false
```

Garder tous les `NEXT_PUBLIC_*` à `false`, puis redéployer.

Résultat attendu : `server_foundation`.

Vérifier :

- les deux crons média apparaissent toutes les minutes ;
- `/api/health/internal` retourne `media_pipeline.ok=true` ;
- aucune lease expirée persistante ;
- aucun impact sur les publications historiques.

## Phase 4 — Canary upload et workspace

Activer puis redéployer :

```text
NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1=true
NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1=true
```

Laisser les flags de consommation unifiée et cutover à `false`.

Résultat attendu : `workspace_canary`.

Sur le compte interne, tester insertion, progression, reprise après
actualisation, suppression, réouverture du brouillon et absence de doublon dans
Storage.

## Phase 5 — Canary de consommation unifiée

Activer puis redéployer :

```text
MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1=true
NEXT_PUBLIC_MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1=true
```

Laisser les deux flags cutover à `false`.

Résultat attendu : `unified_canary`.

Tester toute la matrice image/vidéo, les brouillons, la publication immédiate et
la programmation. La voie historique reste disponible pendant ce palier.

## Phase 6 — Bascule complète

Activer puis redéployer :

```text
MEDIA_PIPELINE_LEGACY_CUTOVER_V1=true
NEXT_PUBLIC_MEDIA_PIPELINE_LEGACY_CUTOVER_V1=true
```

Résultat attendu : `full_cutover`.

Lancer immédiatement :

```bash
REQUIRE_MEDIA_PIPELINE_CUTOVER=1 npm run verify:media-pipeline:rollout
```

Puis depuis un poste autorisé :

```bash
APP_BASE_URL=https://app.inrcy.com \
HEALTHCHECK_TOKEN=... \
REQUIRE_MEDIA_PIPELINE_CUTOVER=1 \
npm run smoke:media-pipeline
```

Observer pendant le canary :

- Sentry et logs Vercel ;
- `/api/health/internal` ;
- les deux crons média ;
- le SQL de certification final ;
- au moins 20 publications représentatives.

## Rollback niveau 1 — Sortie du cutover strict

Couper puis redéployer :

```text
MEDIA_PIPELINE_LEGACY_CUTOVER_V1=false
NEXT_PUBLIC_MEDIA_PIPELINE_LEGACY_CUTOVER_V1=false
```

Le transport historique redevient disponible. Les workspaces et variantes déjà
créés sont conservés.

## Rollback niveau 2 — Sortie de la consommation unifiée

Si nécessaire, couper également :

```text
MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1=false
NEXT_PUBLIC_MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1=false
```

Le client peut continuer à uploader et persister les médias, mais Générer,
Publier et Programmer reviennent au parcours historique.

## Rollback niveau 3 — Retour complet au comportement historique

En dernier recours, couper tous les flags média et redéployer. Ne pas annuler les
migrations Supabase : elles sont additives et les anciennes routes restent
compatibles.

## Seuils d'arrêt

Stopper le palier en cours si :

- une isolation multicompte est mise en défaut ;
- trois smoke tests consécutifs échouent ;
- plus de 5 % des publications échouent sur un échantillon d'au moins 20 ;
- un workspace reste bloqué plus de 15 minutes après la fin de l'upload ;
- une lease expirée n'est pas reprise au cron suivant ;
- l'ordre, le cadrage ou le type de média est altéré.
