# Pipeline média universel — Étape 6 — Normalisation automatique des vidéos

Date : 29 juillet 2026

## Objectif

Cette étape prépare automatiquement chaque vidéo source du workspace, sans attendre le clic sur Générer, Publier ou Programmer.

La source originale privée reste conservée. Le worker FFmpeg produit des dérivés stables et réutilisables :

1. `canonical` : MP4 H.264/AAC universel, sans recadrage ;
2. `ai_preview` : MP4 visuel allégé pour les traitements futurs ;
3. `thumbnail` : miniature JPEG ;
4. `video_frame` × 3 : captures début, milieu et fin ;
5. `audio_track` : MP3 mono 16 kHz pour la transcription future, lorsque la source contient de l’audio.

L’ancien moteur vidéo Booster reste intact. L’Étape 6 ne bascule pas encore les publications vers les nouvelles variantes : cette unification relève de l’Étape 7.

## Activation contrôlée

Variable serveur :

```text
MEDIA_PIPELINE_VIDEO_NORMALIZATION_V1=true
```

Pré-requis :

```text
NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1=true
NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1=true
```

La migration SQL Étape 6 doit être exécutée avant l’activation du flag.

## Migration Supabase

À exécuter :

```text
ops/sql/2026-07-29_media_pipeline_step6_video_normalization.sql
```

Elle ajoute uniquement deux fonctions backend :

- `inrcy_enqueue_video_normalization` ;
- `inrcy_claim_video_normalization_jobs`.

Elle vérifie aussi de façon additive que `audio/mpeg` est accepté par le bucket privé `inrcy-pro-media` lorsqu'une liste MIME existe. Un bucket déjà sans restriction reste sans restriction.

La première crée idempotemment les sept entrées de variantes et le job persistant. La seconde claim un seul job vidéo avec `FOR UPDATE SKIP LOCKED`, une lease de sept minutes et cinq tentatives maximum.

Les fonctions sont `SECURITY DEFINER`, révoquées pour `anon` et `authenticated`, puis accordées uniquement à `service_role`.

Contrôle lecture seule :

```text
ops/sql/2026-07-29_media_pipeline_step6_verify.sql
```

## Déclenchement automatique

Lorsqu’un upload vidéo passe à `uploaded`, la route :

```text
POST /api/media-pipeline/upload-event
```

met immédiatement le média en file.

Une source déjà uploadée retrouvée via sa clé stable est également remise en file depuis `upload-intent`. Cette reprise est idempotente et ne recrée ni fichier source, ni variante, ni job.

Le cron répare aussi les vidéos `not_requested` ou `failed_retryable` laissées sans traitement après une interruption. Le compteur de tentatives et le backoff déjà calculé sont conservés.

## Worker vidéo

Route :

```text
GET/POST /api/cron/media-video-normalization
```

Planification Vercel : chaque minute.

Protection :

```text
VERCEL_CRON_SECRET
```

Le worker :

1. claim au maximum une vidéo ;
2. télécharge la source privée via une URL signée ;
3. écrit la source dans `/tmp` en calculant son SHA-256 ;
4. vérifie FFmpeg et sonde durée, dimensions, rotation et présence audio ;
5. génère le MP4 canonique ;
6. génère l’aperçu IA puis les trois captures et la miniature ;
7. extrait une piste MP3 mono 16 kHz lorsque l’audio existe ;
8. upload les dérivés dans `inrcy-pro-media` ;
9. met à jour `media_variants`, `pro_media_library` et le job ;
10. resynchronise le statut du workspace.

Le binaire `ffmpeg-static` est explicitement inclus dans la fonction Vercel. Le worker reste séquentiel pour ne jamais encoder deux sources de 100 Mo simultanément.

## Politique canonique

- sortie MP4 ;
- codec vidéo H.264 ;
- audio AAC stéréo si présent ;
- pixel format `yuv420p` ;
- `+faststart` ;
- rotation appliquée puis métadonnée de rotation neutralisée ;
- métadonnées et chapitres de la source retirés des dérivés ;
- ratio conservé ;
- aucune coupe ;
- aucun agrandissement ;
- côté maximal 1 920 px ;
- débit calculé selon la durée pour rester sous le plafond Storage ;
- seconde passe plus légère si le premier résultat dépasse le budget ;
- plafond canonique de 94 Mo.

## Dérivés IA

### Aperçu vidéo

- maximum 1 280 px ;
- 15 images par seconde ;
- sans piste audio ;
- plafond de 32 Mo.

### Captures

- trois JPEG, vers 10 %, 50 % et 90 % de la durée ;
- maximum 1 280 px ;
- miniature séparée limitée à 720 px ;
- aucune coupe.

### Audio

- MP3 ;
- mono ;
- 16 kHz ;
- 64 kbit/s ;
- plafond de 40 Mo.

Une vidéo silencieuse est un cas valide : la variante `audio_track` passe à `ready` avec `available=false`, sans créer de fichier vide et sans bloquer le workspace.

## Reprises et erreurs

États média :

```text
queued → processing → ready
```

En cas d’erreur temporaire :

```text
failed_retryable + retry_wait
```

Le délai augmente de 30 secondes à 15 minutes. Le job possède cinq tentatives maximum. Une source invalide, corrompue, sans flux vidéo, aux métadonnées impossibles ou produisant une sortie hors plafond passe en `failed_terminal`.

Les chemins Storage et signatures étant stables, une lease expirée peut être reprise sans créer de doublons.

## Statut du workspace

Lorsque le flag Étape 6 est actif :

- une vidéo uploadée mais non normalisée laisse le workspace en `waiting_media` ;
- la fin du traitement fait passer le workspace à `ready` ;
- un échec terminal le fait passer à `failed`.

Les règles images de l’Étape 5 continuent de fonctionner indépendamment avec leur propre feature flag.

## Compatibilité

Cette étape ne supprime ni ne remplace :

- `/api/booster/video-transform` ;
- `buildVideoTransformSignature()` ;
- les variantes par canal existantes ;
- le contexte vidéo iNrAgent existant ;
- les contrats vidéo iNrSend ;
- les routes historiques de publication et de nettoyage.

Les nouvelles variantes seront consommées par Générer, Publier et Programmer à l’Étape 7.

## Nettoyage des contrôles obsolètes

Le test `booster-image-pipeline-step3.test.mjs` ne recherche plus l’ancien helper supprimé `fileToImagePayload(file)`. Il contrôle désormais le comportement réel de la branche `Originale` : présence de `sourceFile: file` et absence de rendu `renderChannelImage()`.

Le contrôle Étape 5 du workspace vérifie maintenant la règle centralisée `required` compatible avec les flags image et vidéo, au lieu d’exiger l’ancienne condition « tout média non-image est prêt ».

Enfin, l’audit multicompte vérifie la politique actuelle `APP_BUBBLE_ALWAYS_ENABLED_KEYS` et la présence de `inr_agent`, plutôt que les anciennes variables `mustEnableInrAgent` supprimées. La couverture fonctionnelle est conservée et les faux négatifs récurrents sont éliminés.

## Contrôle qualité

```bash
npm run qa:media-pipeline:step6
```

Cette commande rejoue les étapes 1 à 5, audite l’architecture Étape 6 et vérifie ses contrats de politique, SQL, worker, workspace et feature flag.
