# Pipeline média universel — Étape 5 — Normalisation automatique des images

Date : 29 juillet 2026

## Objectif

Cette étape transforme automatiquement chaque image source du workspace en versions stables, privées et réutilisables, sans attendre le clic sur Générer, Publier ou Programmer.

La source originale reste conservée. Le worker produit trois variantes :

1. `canonical` : version universelle haute qualité, sans recadrage ;
2. `ai_preview` : JPEG limité à 1 280 px pour la vision IA ;
3. `thumbnail` : JPEG limité à 480 px pour les interfaces et restaurations futures.

L’ancien pipeline de publication reste présent comme secours. L’étape 5 ne bascule pas encore les connecteurs sociaux vers ces variantes.

## Activation contrôlée

Variable serveur :

```text
MEDIA_PIPELINE_IMAGE_NORMALIZATION_V1=true
```

Pré-requis avant activation :

```text
NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1=true
NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1=true
```

La migration SQL Étape 5 doit être exécutée avant d’activer le flag serveur.

## Migration Supabase

À exécuter :

```text
ops/sql/2026-07-29_media_pipeline_step5_image_normalization.sql
```

Elle ajoute uniquement deux fonctions backend :

- `inrcy_enqueue_image_normalization` ;
- `inrcy_claim_image_normalization_jobs`.

La première crée idempotemment les trois lignes `media_variants` et le job persistant. La seconde claim les jobs avec `FOR UPDATE SKIP LOCKED`, une lease et un maximum de tentatives.

Les fonctions sont `SECURITY DEFINER`, révoquées pour `anon` et `authenticated`, puis accordées uniquement à `service_role`.

Contrôle lecture seule :

```text
ops/sql/2026-07-29_media_pipeline_step5_verify.sql
```

## Déclenchement automatique

Lorsqu’un upload image passe à `uploaded`, la route :

```text
POST /api/media-pipeline/upload-event
```

met immédiatement le média en file.

Une source déjà uploadée et retrouvée via `client_media_key` est également remise en file depuis `upload-intent`. Cela couvre les actualisations, reprises réseau et doubles appels sans créer de doublon.

Le cron répare aussi les images `not_requested` ou `failed_retryable` qui auraient été laissées sans job après une interruption temporaire. Lorsqu’un retry est déjà planifié, cette réparation conserve son compteur de tentatives et son délai de backoff.

## Worker image

Route :

```text
GET/POST /api/cron/media-image-normalization
```

Planification Vercel : chaque minute.

Protection :

```text
VERCEL_CRON_SECRET
```

Le worker :

1. claim au maximum deux images par exécution par défaut ;
2. télécharge la source privée avec une URL signée temporaire ;
3. écrit la source dans `/tmp` en calculant son SHA-256 ;
4. lance Sharp sans transporter le fichier dans une requête navigateur → Vercel ;
5. upload les trois variantes dans `inrcy-pro-media` ;
6. met à jour `media_variants`, `pro_media_library` et le job ;
7. resynchronise le statut du workspace.

Le traitement reste volontairement séquentiel pour protéger la mémoire du runtime serverless.

## Politique de normalisation

### Canonique

- rotation EXIF automatique ;
- aucune coupe ;
- ratio conservé ;
- maximum 4 096 px ;
- aucun agrandissement ;
- JPEG qualité 88 pour une image opaque ;
- PNG pour conserver une transparence ;
- métadonnées EXIF retirées.

### Aperçu IA

- maximum 1 280 px ;
- JPEG qualité 76 ;
- fond blanc si transparence ;
- aucune coupe ;
- mêmes dimensions et qualité que la préparation IA historique.

### Miniature

- maximum 480 px ;
- JPEG qualité 72 ;
- aucune coupe.

Pour une image animée, la source est conservée et les variantes de cette étape utilisent la première image. Les variantes animées ou spécifiques aux réseaux pourront être ajoutées ultérieurement sans perdre l’original.

## HEIC / HEIF

Sharp est essayé en premier. Lorsque le binaire déployé ne possède pas le décodeur HEIC complet, le worker utilise `heic-convert`, puis repasse la sortie dans le même pipeline Sharp.

## Reprises et erreurs

États média :

```text
queued → processing → ready
```

En cas d’erreur temporaire :

```text
failed_retryable + retry_wait
```

Le délai augmente de 30 secondes à 15 minutes. Le job possède cinq tentatives maximum. Une image illisible ou une source définitivement invalide passe en `failed_terminal`.

Une lease expirée peut être reprise par un autre worker sans double traitement final : les chemins Storage et les signatures sont stables.

## Statut du workspace

Lorsque le flag Étape 5 est actif :

- une image uploadée mais non normalisée laisse le workspace en `waiting_media` ;
- les trois variantes prêtes font passer le workspace à `ready` ;
- un échec terminal fait passer le workspace à `failed` ;
- les vidéos continuent de dépendre uniquement de leur upload jusqu’à l’Étape 6.

Lorsque le flag est désactivé, le comportement exact de l’Étape 4 est conservé.

## Compatibilité

Cette étape ne supprime ni ne remplace :

- `uploadOriginalImagesForPublication()` ;
- `uploadPublicationDraftImages()` ;
- les conversions finales par canal ;
- `imagesByChannel` ;
- `imageSettingsByChannel` ;
- les routes historiques de publication.

Les variantes Étape 5 seront utilisées par Générer, Publier et Programmer à l’Étape 7, après la normalisation vidéo de l’Étape 6.

## Contrôle qualité

```bash
npm run qa:media-pipeline:step5
```

Cette commande rejoue toutes les étapes 1 à 4, audite l’architecture Étape 5 et vérifie ses contrats SQL, worker, workspace et feature flag.
