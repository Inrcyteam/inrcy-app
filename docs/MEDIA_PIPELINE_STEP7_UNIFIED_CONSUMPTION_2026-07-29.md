# Pipeline média universel — Étape 7 — Générer, Publier et Programmer unifiés

Date : 29 juillet 2026

## Objectif

Cette étape fait du `publication_workspace` la référence commune des trois actions principales de Booster :

1. **Générer** relit les aperçus IA déjà normalisés ;
2. **Publier** relit les variantes canoniques privées ;
3. **Programmer** conserve la référence du workspace et la relit au moment réel de l’exécution.

Le média n’est plus seulement attaché à une requête ponctuelle. Son identité, son ordre, ses variantes, son contenu généré, ses canaux et son cycle de publication restent réunis dans le même workspace.

L’Étape 7 garde toutefois les anciens transports image et vidéo comme filet de sécurité. Leur suppression est volontairement reportée à l’Étape 8.

## Activation contrôlée

Variables serveur et client :

```text
MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1=true
NEXT_PUBLIC_MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1=true
```

Pré-requis :

```text
NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1=true
NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1=true
MEDIA_PIPELINE_IMAGE_NORMALIZATION_V1=true
MEDIA_PIPELINE_VIDEO_NORMALIZATION_V1=true
```

La migration SQL Étape 7 doit être exécutée avant l’activation des deux nouveaux flags.

## Migration Supabase

À exécuter :

```text
ops/sql/2026-07-29_media_pipeline_step7_unified_consumption.sql
```

La migration ne crée ni table ni colonne. Elle ajoute uniquement trois index idempotents :

- ordre des médias d’un workspace ;
- lecture des variantes `ready` par établissement, média et usage ;
- reprise des workspaces actifs, prêts, programmés ou en publication.

Contrôle en lecture seule :

```text
ops/sql/2026-07-29_media_pipeline_step7_verify.sql
```

## Couche de consommation commune

Le module :

```text
lib/mediaWorkspaceConsumption.ts
```

applique les mêmes garanties à Générer, Publier et Programmer :

- workspace obligatoirement rattaché à l’établissement actif ;
- média rattaché au même établissement ;
- ordre lu depuis `publication_workspace_media.position` ;
- source obligatoirement uploadée ;
- traitement et préparation publication obligatoirement `ready` ;
- variantes lues uniquement lorsqu’elles sont `ready` ;
- bucket et chemin Storage transmis explicitement ;
- aucune URL publique permanente créée pour le bucket privé.

Une référence appartenant à un autre établissement est donc traitée comme introuvable.

## Générer

La route :

```text
POST /api/booster/generate
```

accepte désormais `mediaWorkspaceId`.

### Images

Pour cinq images maximum, la route relit les variantes `ai_preview`, les télécharge côté serveur et les transmet au moteur IA dans l’ordre du workspace.

### Vidéo

La route réutilise :

- les trois variantes `video_frame` ;
- la variante `audio_track` lorsqu’elle est disponible ;
- les métadonnées de durée et de source de `ai_preview`.

La piste audio normalisée est transcrite par le point d’entrée AI Gateway existant. Une vidéo silencieuse ou une transcription indisponible ne bloque pas la génération.

Après génération, le workspace mémorise :

- l’idée ;
- le thème ;
- les canaux sélectionnés ;
- `postByChannel` ;
- les options IA ;
- la révision et la source de consommation.

### Secours

Si le workspace n’est pas encore prêt, si le flag est désactivé ou si une variante manque, la route conserve les images, captures et transcriptions historiques déjà préparées par le navigateur. Le clic du professionnel reste donc fonctionnel pendant la phase de transition.

## Publier

La route :

```text
POST /api/booster/publish-now
```

relit la variante `canonical` de chaque image ou vidéo.

### Images

Les images canoniques privées deviennent la base commune. La route sait maintenant télécharger un `storagePath` depuis son bucket réel, et non plus uniquement depuis `booster`.

Au moment de la publication, une source canonique privée est copiée dans le stockage de diffusion `booster`. Cette copie transitoire garantit la compatibilité des proxys et connecteurs historiques qui manipulent encore un chemin sans nom de bucket. Son extension est dérivée du MIME canonique afin d’éviter, par exemple, des octets JPEG publiés sous un ancien nom HEIC.

Les adaptations et personnalisations par canal déjà préparées par Booster sont conservées durant l’Étape 7. Elles restent prioritaires pour les canaux concernés, tandis que le canonique du workspace sert de source fiable et de repli.

### Vidéo

Le MP4 canonique privé devient la vidéo source. Son nom est normalisé en `.mp4`, et sa miniature privée reçoit une URL signée depuis son bucket réel. Les `transformedVariants` historiques par canal restent attachées au payload afin de préserver :

- TikTok ;
- YouTube Shorts ;
- Pinterest ;
- Instagram et Facebook ;
- les choix de format et de mode d’adaptation.

Pour TikTok, la vidéo est téléchargée côté serveur depuis le bucket indiqué par le workspace. Le proxy historique reste réservé aux chemins `booster`, ce qui évite de demander par erreur un fichier privé dans le mauvais bucket.

### Cycle

Le workspace suit désormais :

```text
ready → publishing → published
```

En cas d’échec d’upload dérivé, d’enregistrement, de tous les canaux ou d’exception non gérée :

```text
publishing → failed
```

L’événement iNrSend conserve aussi l’identifiant du workspace, sa révision et la source de consommation.

## Programmer

Le payload enregistré dans :

```text
inr_agent_scheduled_actions
```

conserve `mediaWorkspaceId` et `mediaWorkspaceClientKey`.

La création de la programmation synchronise :

- le statut `scheduled` ;
- la première échéance du workspace ;
- les canaux ;
- le contenu ;
- les options médias ;
- l’identifiant de l’action iNrAgent.

À l’heure prévue, le cron transmet toujours `publishPayload` à `/api/booster/publish-now`. La route relit donc les variantes canoniques depuis le registre au moment réel de l’envoi, au lieu de dépendre uniquement d’une URL temporaire créée plusieurs jours auparavant.

## Compatibilité et filet de sécurité

Cette étape ne retire pas :

- `uploadPreparedImages()` ;
- l’upload vidéo Booster historique ;
- `preparePublicationVideoVariants()` ;
- `imagesByChannel` ;
- `imageSettingsByChannel` ;
- `transformedVariants` ;
- le contexte vidéo iNrAgent ;
- les contrats Pinterest, YouTube, TikTok, Meta, LinkedIn, Google Business et sites ;
- les pièces jointes iNrSend existantes.

Le nouveau workspace est préféré lorsqu’il est prêt. Le transport historique reste disponible si la lecture unifiée échoue. Cette double voie est volontaire et sera supprimée seulement après certification Étape 8.

## Contrôle qualité

```bash
npm run qa:media-pipeline:step7
```

Cette commande rejoue les étapes 1 à 6, puis contrôle :

- les deux feature flags ;
- le scope établissement ;
- l’ordre des médias ;
- les variantes IA et canoniques ;
- les trois actions Générer, Publier et Programmer ;
- le cycle du workspace ;
- le maintien des anciens filets ;
- la compatibilité des buckets privés avec TikTok ;
- la signature des miniatures vidéo ;
- les extensions cohérentes avec les MIME canoniques ;
- le caractère additif du SQL.
