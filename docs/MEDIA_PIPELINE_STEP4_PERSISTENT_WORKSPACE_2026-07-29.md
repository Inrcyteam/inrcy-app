# Pipeline média universel — Étape 4 — Workspace persistant dès insertion

Date : 29 juillet 2026

## Objectif

Cette étape relie le transport direct de l’étape 3 au registre de l’étape 2.

Dès qu’une image ou une vidéo active est acceptée dans Booster, iNrCy peut maintenant :

1. créer ou réutiliser un workspace de publication ;
2. créer ou réutiliser la ligne source dans `pro_media_library` ;
3. envoyer le fichier directement vers Supabase Storage ;
4. attacher le média au workspace avec sa position ;
5. conserver la progression et l’erreur dans le registre ;
6. passer le workspace à `ready` lorsque tous les médias sont uploadés, ou à `failed` si l’un échoue.

Le fichier lourd ne traverse toujours aucune route Vercel.

## Activation contrôlée

L’étape 4 possède son propre interrupteur :

```text
NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1=true
NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1=true
```

Les deux variables doivent être actives. Si la seconde reste absente ou à `false`, Booster conserve exactement son comportement précédent.

## Nouveau client workspace

```text
lib/mediaWorkspaceClient.ts
```

Il fournit :

- une clé workspace stable pendant la session navigateur ;
- une clé stable par fichier pour la déduplication ;
- la création/réutilisation du workspace ;
- le nettoyage des anciennes associations ;
- la liaison avec un brouillon ;
- l’archivage après publication.

La clé en `sessionStorage` survit à une actualisation de la page, sans créer de workspace en double.

## Orchestrateur Booster

```text
app/dashboard/booster/publier/usePersistentMediaWorkspace.ts
```

Il garantit :

- upload immédiat après validation locale ;
- ordre 0 à 4 pour les images ;
- position 0 pour la vidéo ;
- progression persistée ;
- annulation d’une opération devenue obsolète ;
- réutilisation d’un média déjà uploadé via `client_media_key` ;
- synchronisation complète après ajout, suppression ou remplacement.

Le workspace reflète la famille média active conformément au contrat SQL : maximum cinq images **ou** une vidéo. Lors d’un basculement images/vidéo, les associations sont remplacées, mais les sources déjà uploadées restent réutilisables.

## Routes légères

```text
POST /api/media-pipeline/workspace
GET  /api/media-pipeline/workspace
POST /api/media-pipeline/upload-intent
```

La route workspace gère uniquement du JSON :

- `ensure` ;
- `clear_media` ;
- `link_draft` ;
- `archive`.

`upload-intent` vérifie désormais :

- que le workspace appartient à l’établissement actif ;
- qu’il n’est pas clôturé ;
- que la position est valide ;
- que le média et le workspace appartiennent au même compte ;
- que la liaison respecte les triggers de l’étape 2.

## Brouillons et publication

Les brouillons enregistrent maintenant :

```text
mediaWorkspaceId
mediaWorkspaceClientKey
```

À la reprise, Booster peut réadopter le même workspace. Après une publication réussie, l’archivage est lancé en best effort et ne peut pas transformer une publication réussie en échec d’interface.

## Compatibilité et filet de sécurité

Cette étape ne supprime rien :

- `uploadPublicationDraftImages()` reste disponible ;
- `uploadOriginalImagesForPublication()` reste disponible ;
- `uploadPublicationVideoForPublish()` reste disponible ;
- les payloads `imagesByChannel`, `imageSettingsByChannel` et `video` restent inchangés ;
- l’ajout d’un média ne déclenche aucune régénération de texte ;
- le pipeline historique reste le secours au moment de publier ou programmer.

## SQL

Aucune migration destructive ou nouvelle table n’est nécessaire à l’étape 4. Elle utilise les tables créées à l’étape 2.

Contrôle lecture seule facultatif :

```text
ops/sql/2026-07-29_media_pipeline_step4_verify.sql
```

La migration Storage de l’étape 3 reste requise avant d’activer les deux feature flags.

## Ce qui reste volontairement pour les étapes suivantes

- restauration complète des fichiers privés depuis le workspace après fermeture de session ou changement d’appareil ;
- worker Sharp / FFmpeg ;
- création des variantes canonique, IA et réseau ;
- remplacement des uploads tardifs de publication par les variantes prêtes ;
- suppression finale des routes historiques.

## Contrôle qualité

```bash
npm run qa:media-pipeline:step4
```

Cette commande rejoue les étapes 1 à 3 puis vérifie le workspace persistant et ses contrats de non-régression.
