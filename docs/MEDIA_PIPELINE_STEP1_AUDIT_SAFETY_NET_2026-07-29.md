# Pipeline média universel — Étape 1 — Audit et filet de sécurité

Date : 29 juillet 2026

## Objectif de cette étape

Cette étape prépare la refonte du pipeline média sans modifier le comportement de production.

Elle apporte :

- une cartographie vérifiée des parcours images et vidéo ;
- une liste des contrats à conserver pendant la migration ;
- un audit statique exécutable ;
- des tests de non-régression sur les points d'entrée critiques ;
- une base de décision pour les étapes suivantes.

Aucune route, table, limite, publication, programmation ou génération n'est modifiée dans cette étape.

## Commande de contrôle

```bash
npm run qa:media-pipeline:step1
```

Cette commande exécute :

1. l'audit statique du pipeline média ;
2. les tests de contrats média ;
3. les tests historiques des règles de poids et de formats.

## Cartographie actuelle

### 1. Ajout d'images dans Booster

Point d'entrée :

- `app/dashboard/booster/publier/usePublishImageController.ts`

Parcours actuel :

```text
Sélection locale
→ filtrage du format
→ conversion HEIC/HEIF via /api/booster/convert-image
→ contrôle 5 images / 40 Mo par image / 40 Mo au total
→ conservation dans l'état React sous forme de File
→ aperçu local avec URL.createObjectURL
```

Constats :

- le média n'est pas persistant au moment de son insertion ;
- le fichier HEIC/HEIF traverse une route Next/Vercel avant d'entrer dans l'état ;
- la conversion renvoie également le binaire converti dans la réponse ;
- les autres images restent uniquement dans la mémoire de l'onglet jusqu'à une action ultérieure.

### 2. Génération avec images

Points d'entrée :

- `app/dashboard/booster/publier/PublishModal.tsx`
- `lib/boosterGenerationTransportClient.ts`
- `app/api/booster/generate/route.ts`

Parcours actuel :

```text
File local
→ préparation IA locale
→ image JPEG légère pour l'IA
→ multipart vers /api/booster/generate
→ reconstruction serveur du contexte visuel
→ génération des textes
```

Ce parcours est distinct du parcours de publication. Les images utilisées par l'IA ne sont pas les fichiers persistants utilisés ensuite pour publier.

### 3. Ajout d'images après génération

Le texte déjà généré reste intact. Les images sont ajoutées au même état local React et ne sont envoyées qu'au moment de sauvegarder, programmer ou publier.

Ce comportement doit être conservé : l'ajout d'un média ne doit jamais régénérer ni remplacer automatiquement les textes.

### 4. Publication immédiate avec images

Points d'entrée :

- `app/dashboard/booster/publier/PublishModal.tsx`
- `app/dashboard/booster/publier/usePublishImageController.ts`
- `app/dashboard/booster/publier/publishModal.shared.tsx`
- `app/api/booster/upload-prepared/route.ts`

Parcours actuel :

```text
Files locaux
→ rendu Canvas par canal
→ compression locale partielle
→ upload des originaux via /api/booster/upload-prepared
→ upload des rendus par canal via /api/booster/upload-prepared
→ payload imagesByChannel + imageSettingsByChannel
→ publication
```

Une même image peut produire plusieurs binaires : original, Instagram, Facebook, Pinterest, Google Business, etc.

Le cache `preparedUploadCache` évite certains doublons pendant la durée de vie de l'onglet, mais il n'est ni persistant ni partagé entre appareils.

### 5. Programmation avec images

La programmation répète pratiquement le même pipeline que la publication immédiate :

```text
rendu local
→ upload des originaux
→ upload des rendus adaptés
→ création de l'action /api/agent/scheduled-actions
```

Le média est donc préparé tardivement, au clic sur Programmer.

### 6. Brouillons images

La sauvegarde d'un brouillon envoie chaque fichier via `/api/booster/upload-prepared`.

À la reprise, les URLs sont téléchargées dans le navigateur puis recréées sous forme de `File`. Le média persistant est donc reconverti en fichier local avant de reprendre le parcours historique.

### 7. Ajout et utilisation d'une vidéo

Points d'entrée :

- `app/dashboard/booster/publier/PublishModal.tsx`
- `app/dashboard/booster/publier/usePublishVideoController.ts`
- `app/dashboard/booster/publier/publishModal.shared.tsx`
- `app/api/booster/video-upload-url/route.ts`
- `app/api/booster/video-transform/route.ts`

Parcours actuel :

```text
Sélection locale
→ contrôle du format et limite source de 100 Mo
→ conservation du File dans l'état React
→ extraction locale des frames et de l'audio pour l'IA
→ upload direct signé vers Supabase seulement lors d'un besoin ultérieur
→ transformation synchrone éventuelle via /api/booster/video-transform
```

Le transport vidéo source utilise déjà `uploadToSignedUrl`, ce qui constitue une bonne fondation réutilisable. En revanche :

- l'upload n'est pas déclenché dès l'insertion ;
- la limite source de 100 Mo bloque des vidéos courtes mais fortement encodées ;
- les transformations lourdes restent liées à une route synchrone ;
- la reprise réseau résumable n'est pas mise en place.

### 8. Médiathèque

Points d'entrée :

- `app/dashboard/mediatheque/MediaLibraryClient.tsx`
- `app/api/media-library/upload/route.ts`
- `public.pro_media_library`
- bucket `inrcy-pro-media`

La Médiathèque possède déjà un schéma utile :

```text
prepare JSON
→ URL signée
→ uploadToSignedUrl direct vers Supabase
→ finalize JSON
→ insertion dans pro_media_library
```

C'est la meilleure base existante pour le futur upload universel.

Limites actuelles :

- bucket limité à 100 Mo ;
- formats autorisés restreints ;
- `pro_media_library` ne représente pas encore un workspace de publication ;
- aucun statut générique `uploading / processing / ready / failed` ;
- pas de table générique de variantes ;
- une sélection depuis la Médiathèque est retéléchargée sous forme de `File` avant utilisation dans Booster.

## Faiblesses confirmées dans l'existant

### A. Transport binaire des images par des routes applicatives

Les routes suivantes transportent le fichier complet :

- `/api/booster/convert-image` ;
- `/api/booster/upload-prepared`.

La limite fonctionnelle déclarée par iNrCy est de 40 Mo, mais le transport dépend d'une route hébergée. Cette architecture ne garantit pas qu'un fichier accepté par l'interface puisse réellement atteindre la route ou en ressortir.

### B. Upload trop tardif

Les médias sont principalement envoyés lors de :

- la sauvegarde du brouillon ;
- la publication ;
- la programmation ;
- l'application explicite d'un format vidéo.

Une erreur de poids, de format ou de réseau peut donc apparaître à la dernière étape du parcours.

### C. Multiplication des parcours

Le pipeline n'est pas unique :

- génération IA ;
- publication immédiate ;
- programmation ;
- brouillon ;
- Médiathèque ;
- iNrAgent.

Chacun possède une partie de sa propre logique d'upload, de conversion ou de restauration.

### D. État local éphémère

Booster utilise encore principalement des objets `File` et des URLs locales. Une actualisation, un changement d'appareil ou une fermeture d'onglet impose une restauration ou un nouvel upload.

### E. Limites visibles et contradictoires avec l'objectif produit

Les limites actuelles sont :

- 5 images ;
- 40 Mo par image ;
- 40 Mo au total pour les images ;
- 100 Mo pour la vidéo source ;
- 40 Mo pour certaines sorties vidéo publiables.

Le nombre maximal de 5 images et d'une vidéo est un contrat produit à conserver. Les plafonds de poids visibles devront être remplacés par des garde-fous techniques élevés et une préparation automatique.

## Contrats à préserver pendant toute la migration

### Contrats fonctionnels

1. Maximum 5 images ou 1 vidéo dans Booster.
2. Ordre des images conservé.
3. Choix du média par canal conservé.
4. Réglages de cadrage par canal conservés.
5. Google Business peut limiter le carrousel à une image sans modifier l'ordre général.
6. Ajout d'un média après génération sans écraser le texte.
7. Brouillons reprenables.
8. Publication immédiate et programmation capables de partager le même contenu multicanal.
9. Nettoyage des médias vidéo obsolètes conservé.
10. Aucune double publication ni double génération lors d'une reprise réseau.

### Contrats de payload

Les consommateurs existants attendent notamment :

- `mediaType` ;
- `mediaModeByChannel` ;
- `imagesByChannel` ;
- `imageSettingsByChannel` ;
- `video` ;
- `videoFormatByChannel` ;
- `videoAdaptationModeByChannel` ;
- `videoSettingsByChannel` ;
- `storagePath` ;
- `publicUrl` / `url` ;
- `transformedVariants` ;
- `signature` des variantes vidéo.

Les étapes suivantes doivent adapter le producteur de ces données, pas réécrire inutilement tous les connecteurs sociaux.

## Points de réutilisation validés

- `createSignedUploadUrlWithRetry` ;
- `uploadToSignedUrl` ;
- bucket privé et RLS de la Médiathèque ;
- `pro_media_library` comme registre de départ ;
- `buildVideoTransformSignature` ;
- métadonnées et variantes vidéo existantes ;
- rendu et réglages d'images par canal ;
- contrats `imagesByChannel` et `imageSettingsByChannel` ;
- transport IA multipart pour les petites versions d'analyse ;
- nettoyage Storage vidéo existant.

## Découpage validé pour la suite

### Étape 2

Registre média et modèle de données universel, sans bascule des parcours actuels.

### Étape 3

Upload direct universel et résumable, derrière un flag de migration.

### Étape 4

Persistance dès l'insertion et restauration par identifiants média.

### Étape 5

Normalisation automatique des images.

### Étape 6

Normalisation automatique des vidéos avec worker dédié.

### Étape 7

Unification de Générer, Publier et Programmer.

### Étape 8

Bascule et nettoyage des anciens transports.

### Étape 9

Certification complète et activation progressive.

## Résultat de l'étape 1

Le comportement de production reste inchangé, mais le chantier est désormais sécurisé par :

- `scripts/audit-media-pipeline.mjs` ;
- `tests/media-pipeline/media-pipeline-contracts.test.mjs` ;
- `tests/media-pipeline/media-pipeline-journeys.test.mjs` ;
- `npm run qa:media-pipeline:step1`.

Toute modification future d'un parcours critique devra mettre à jour volontairement ces contrats et la documentation associée.
