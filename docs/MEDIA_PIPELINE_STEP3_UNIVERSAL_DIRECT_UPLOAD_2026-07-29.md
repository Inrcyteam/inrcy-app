# Pipeline média universel — Étape 3 — Upload direct et résumable

Date : 29 juillet 2026

## Objectif

Cette étape remplace la faiblesse de transport historique par un moteur commun capable d’envoyer les médias directement du navigateur vers Supabase Storage.

Le fichier lourd ne traverse plus une Function Vercel lorsqu’on active le nouveau transport.

L’étape ne lance pas encore le worker de conversion Sharp / FFmpeg et ne rend pas encore les médias persistants dès leur sélection dans Booster. Ces deux sujets arrivent aux étapes 4, 5 et 6.

## Transport retenu

```text
Fichier <= 6 Mo
→ jeton signé créé par Vercel
→ upload direct Supabase

Fichier > 6 Mo
→ jeton signé créé par Vercel
→ endpoint Storage direct
→ TUS par chunks de 6 Mo
→ reprise à l’offset confirmé par Supabase
```

Le choix de 6 Mo suit la recommandation Supabase pour basculer vers les uploads résumables.

## Ce qui a été ajouté

### Règles partagées

```text
lib/mediaUploadPolicy.ts
```

Le module centralise :

- sélection `signed` / `tus` ;
- chunk TUS de 6 Mo ;
- formats image et vidéo courants ;
- construction du hostname Storage direct ;
- plafonds de sécurité invisibles ;
- validation des destinations d’upload.

### Client universel

```text
lib/universalMediaUploadClient.ts
```

Fonctions principales :

```text
requestUniversalMediaUploadIntent()
uploadFileToPreparedUniversalIntent()
uploadUniversalMediaFile()
```

Garanties :

- retry automatique ;
- upload TUS avec `POST`, `HEAD` et `PATCH` ;
- offset vérifié après une coupure ;
- reprise idempotente avec `x-upsert` sur le chemin signé ;
- reprise locale pendant 23 heures ;
- progression ;
- annulation par `AbortSignal` ;
- statut persistant pour les médias du futur workspace ;
- aucune dépendance JavaScript supplémentaire.

### Routes légères

```text
POST /api/media-pipeline/upload-intent
POST /api/media-pipeline/upload-event
```

`upload-intent` reçoit uniquement du JSON et retourne :

- bucket ;
- chemin Storage ;
- jeton signé ;
- protocole ;
- endpoint TUS direct ;
- identifiant du média si la source est persistante.

La route ne lit jamais le fichier, n’appelle pas `formData()` et ne crée aucun `Buffer` du média.

`upload-event` persiste :

- `uploading` ;
- `uploaded` ;
- `failed` ;
- `removed` ;
- progression ;
- erreur structurée.

## Destinations prévues

```text
booster_prepared_image
booster_draft_image
booster_video_source
media_library_source
workspace_source
```

`workspace_source` utilise le registre créé à l’étape 2 et déduplique la création via `client_media_key`.

## Intégration progressive

Les points historiques suivants savent déjà appeler le nouveau moteur :

- images préparées avant publication ;
- images enregistrées dans un brouillon ;
- vidéo Booster ;
- Médiathèque.

La bascule est protégée par :

```text
NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1=true
```

Tant que cette variable n’est pas activée, le comportement historique reste utilisé.

Même lorsque la variable est active, l’ancien transport reste temporairement disponible comme secours. Ce secours sera supprimé uniquement à l’étape 8 après certification complète.

## Migration Supabase

À exécuter avant l’activation du nouveau transport :

```text
ops/sql/2026-07-29_media_pipeline_step3_universal_direct_upload.sql
```

Elle :

- porte les buckets `booster` et `inrcy-pro-media` à un plafond infrastructure de 5 Gio ;
- retire le verrou MIME du bucket ;
- ne supprime aucune donnée ;
- ne modifie aucune policy RLS ;
- échoue explicitement si un bucket attendu manque.

Contrôle lecture seule :

```text
ops/sql/2026-07-29_media_pipeline_step3_verify.sql
```

La limite globale configurée dans Supabase Storage doit également être au
moins égale au plafond retenu : elle reste prioritaire sur la valeur du bucket.

## Sécurité

L’absence de limite visible ne signifie pas une absence de sécurité.

Le serveur conserve des plafonds anti-abus :

```text
image : 500 Mo
vidéo : 5 Gio
```

Ces plafonds sont très supérieurs à l’usage normal. Ils protègent l’infrastructure contre un fichier anormal ou malveillant. Les limites réelles de publication seront appliquées après compression par le worker.

Chaque intent :

- exige une session valide ;
- utilise l’établissement actif ;
- passe par le rate limiting ;
- impose une destination connue ;
- génère un chemin serveur ;
- ne permet pas au client de choisir librement un bucket ;
- utilise un jeton Storage signé.

## Ce que l’étape 3 ne fait volontairement pas encore

- upload immédiat à la sélection dans Booster ;
- restauration persistante après actualisation ;
- conversion universelle des images ;
- compression vidéo asynchrone ;
- variantes finales par canal ;
- suppression des anciennes routes.

L’étape 4 attachera l’upload au workspace dès l’insertion du média.
