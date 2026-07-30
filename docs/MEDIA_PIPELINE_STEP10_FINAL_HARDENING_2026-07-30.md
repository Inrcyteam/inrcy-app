# Pipeline média — Étape 10 : finalisation performance et sécurité

Date : 30 juillet 2026

## Résultat

Cette étape supprime les conversions binaires qui traversaient encore les
fonctions Vercel et déplace le travail lourd avant le clic sur Générer,
Publier ou Programmer.

Le contrat produit est maintenant le suivant :

- jusqu’à 5 images ;
- 50 Mo maximum par image et 150 Mo maximum pour l’ensemble ;
- une vidéo source jusqu’à 300 Mo ;
- images JPG/JPEG/JFIF, PNG, WebP, GIF, AVIF, HEIC, HEIF, TIFF et BMP ;
- vidéos MP4, M4V, MOV/QT, WebM, MPEG/MPG, AVI, MKV, 3GP/3G2, TS/MTS,
  WMV, FLV et OGV.

Les sources sont conservées dans le bucket privé `inrcy-pro-media`. Les
variantes prêtes à être transmises aux réseaux sont stockées dans `booster`.
Le BMP utilise un décodeur dédié avec contrôle préalable des dimensions, car
le binaire Sharp livré par défaut ne sait pas décoder ce format.

## Flux final

1. Le navigateur valide immédiatement le nombre, le type et la taille.
2. Il demande une intention d’upload au serveur.
3. Il envoie le fichier directement vers Supabase Storage avec l’URL signée.
4. Le serveur confirme l’existence de l’objet et sa taille exacte.
5. La normalisation démarre sans attendre la fin de tout le lot.
6. Les variantes correspondant aux canaux et aux réglages choisis sont
   préparées en arrière-plan et persistées.
7. Générer, Publier et Programmer attendent uniquement les éléments qui ne
   seraient pas encore prêts, puis réutilisent les variantes en cache.

Les images sont envoyées avec une concurrence maximale de trois fichiers. Une
vidéo reste envoyée seule pour ne pas saturer la connexion du professionnel.
La normalisation ciblée traite deux images en parallèle.

## HEIC et HEIF

La route `/api/booster/convert-image` a été supprimée. Un HEIC ou HEIF est
envoyé tel quel au stockage privé puis converti par le worker image. Si le
navigateur ne sait pas l’afficher localement, l’interface montre un aperçu
d’attente qui est remplacé par la miniature normalisée dès qu’elle est prête.

Aucun fichier HEIC/HEIF binaire ne traverse donc une fonction Vercel au moment
de son insertion.

## Variantes de publication

Les variantes image et vidéo utilisent une signature déterministe fondée sur
le média, le canal, le format et les réglages. Une variante déjà produite est
relue depuis `media_variants` au lieu d’être recalculée. Les dimensions du
canon image sont propagées avec le workspace : sur un cache hit, le serveur ne
télécharge même plus le fichier canonique pour relire ses métadonnées.

Les chemins sont stables :

- `<compte>/workspace-channel-images/<media>/<signature>.<extension>` ;
- `<compte>/workspace-channel-videos/<media>/<signature>.mp4`.

La publication immédiate et l’exécution d’une programmation n’encodent plus de
variante vidéo manquante. Le préchauffage est effectué avant la création de la
programmation ; si une variante nécessaire ne peut pas être sécurisée,
l’utilisateur reçoit l’erreur avant que la programmation soit enregistrée.

Le canon vidéo est plafonné à 39 Mo afin de rester sous la limite de
publication interne de 40 Mo, avec une marge d’un mégaoctet.

## Fiabilité

- Les erreurs FFmpeg de timeout, de processus ou de frames temporairement
  indisponibles sont rejouées avec backoff au lieu d’être déclarées
  définitivement fatales.
- La confirmation d’upload ne fait plus confiance à la taille déclarée par le
  client : l’objet est relu dans Storage.
- Les workers vérifient que les chemins sources appartiennent au compte et au
  préfixe `workspace-source`.
- Les médias retirés d’un workspace bénéficient d’un délai de récupération de
  24 heures. Un cron horaire les purge uniquement s’ils ne sont toujours liés
  à aucun workspace.

## Dépendances de production

- Next.js est mis à jour en `16.2.11`.
- Sharp est verrouillé en `0.35.3`, y compris pour la dépendance optionnelle de
  Next.js.
- Les correctifs transitifs `brace-expansion 5.0.9` et `fast-uri 3.1.4` sont
  imposés.
- Une installation propre avec `npm ci` puis `npm audit --omit=dev` retourne
  zéro vulnérabilité de production.

## Migration Supabase

Après les migrations des étapes 2 à 9, exécuter :

```text
ops/sql/2026-07-30_media_pipeline_step10_performance_hardening.sql
```

Puis contrôler le résultat avec la requête strictement en lecture seule :

```text
ops/sql/2026-07-30_media_pipeline_step10_verify.sql
```

La migration :

- fixe `inrcy-pro-media` et `booster` à 300 Mio ;
- remet en file les anciens canons vidéo de plus de 39 Mio afin qu’ils soient
  régénérés une seule fois par le nouveau worker ;
- autorise les types sources annoncés et `audio/mpeg`, nécessaire à l’artefact
  audio intermédiaire du worker vidéo ;
- retire les écritures directes du rôle `authenticated` sur le registre et le
  bucket privé ;
- ajoute un trigger qui empêche un chemin média de sortir du préfixe du compte.

Les uploads continuent à fonctionner avec les jetons signés émis par les
routes serveur.

## Variables Vercel

Aucune variable supplémentaire n’est nécessaire. Pour le palier final, les dix
variables existantes restent à `true` :

```text
MEDIA_PIPELINE_UPLOADS_V1=true
MEDIA_PIPELINE_WORKSPACE_V1=true
MEDIA_PIPELINE_IMAGE_NORMALIZATION_V1=true
MEDIA_PIPELINE_VIDEO_NORMALIZATION_V1=true
MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1=true
MEDIA_PIPELINE_LEGACY_CUTOVER_V1=true
NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1=true
NEXT_PUBLIC_MEDIA_PIPELINE_WORKSPACE_V1=true
NEXT_PUBLIC_MEDIA_PIPELINE_UNIFIED_CONSUMPTION_V1=true
NEXT_PUBLIC_MEDIA_PIPELINE_LEGACY_CUTOVER_V1=true
```

Le secret `VERCEL_CRON_SECRET` ou `CRON_SECRET` doit déjà être présent pour
les crons protégés.

## Déploiement

1. Déployer le code avec les dix variables du palier final.
2. Exécuter immédiatement la migration Étape 10, puis sa vérification. Cet
   ordre garantit que les anciens canons vidéo sont repris par le nouveau
   worker plafonné à 39 Mio.
3. Exécuter `npm run certify:media-pipeline:full`.
4. Exécuter `REQUIRE_MEDIA_PIPELINE_CUTOVER=1 npm run verify:media-pipeline:rollout`.
5. Lancer le smoke test de production documenté à
   `ops/MEDIA_PIPELINE_PRODUCTION_CUTOVER_2026-07-29.md`.

Le cron `/api/cron/media-orphan-cleanup` s’exécute à la minute 17 de chaque
heure. La route de préchauffage embarque le binaire FFmpeg dans son bundle
Vercel.
