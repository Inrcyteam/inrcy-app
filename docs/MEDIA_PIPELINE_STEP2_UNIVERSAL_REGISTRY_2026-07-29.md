# Pipeline média universel — Étape 2 — Registre et modèle de données

Date : 29 juillet 2026

## Objectif

Cette étape installe le socle de données du futur moteur média universel sans basculer les parcours actuels de Booster.

Le comportement de production reste inchangé :

- les images continuent d'utiliser le pipeline historique ;
- les vidéos continuent d'utiliser le pipeline historique ;
- Générer, Publier, Programmer et les brouillons conservent leurs payloads actuels ;
- aucune limite de poids n'est encore modifiée ;
- aucun worker n'est encore lancé.

L'étape crée uniquement les structures nécessaires pour pouvoir migrer progressivement et sans régression.

## Migration Supabase à exécuter

```text
ops/sql/2026-07-29_media_pipeline_step2_universal_registry.sql
```

Pré-requis :

```text
ops/sql/20260625_pro_media_library.sql
ops/sql/2026-07-05_multicompte_step1_foundation.sql
ops/sql/2026-07-05_multicompte_step2_scope_security.sql
```

La migration est transactionnelle, additive et idempotente. Elle ne contient aucun `DROP TABLE`, `DROP COLUMN` ou `TRUNCATE`.

Vérification lecture seule après exécution :

```text
ops/sql/2026-07-29_media_pipeline_step2_verify.sql
```

## 1. Évolution de `pro_media_library`

La table existante reste la source de vérité des médias. Aucune colonne historique n'est renommée ou supprimée.

### Compatibilité multicompte

`user_id` reste la colonne physique utilisée par le code actuel. Depuis la migration multicompte, elle représente l'identifiant de l'établissement actif.

La migration remplace donc proprement son ancienne clé étrangère vers `auth.users` par une clé étrangère vers `public.inrcy_accounts`. Les UUID historiques restent identiques, tandis que les établissements secondaires peuvent désormais posséder leurs propres médias. Le compte d'un média et celui d'un workspace deviennent immuables après création afin d'éviter toute incohérence cross-account.

Une colonne générée est ajoutée :

```text
account_id = user_id
```

Elle est en lecture seule et donne au nouveau pipeline un vocabulaire explicite sans casser les insertions actuelles.

### Nouveaux états

```text
upload_status
upload_progress
upload_protocol
processing_status
publication_status
processing_progress
pipeline_version
```

Les lignes historiques reçoivent :

```text
upload_status      = uploaded
processing_status  = not_requested
publication_status = legacy_ready
pipeline_version   = 0
```

`legacy_ready` est volontaire : un média historique reste publiable, mais n'est pas présenté comme ayant déjà été normalisé par le futur worker.

### Source et version canonique

Les colonnes existantes :

```text
bucket_name
storage_path
mime_type
size_bytes
```

continuent de représenter la source originale.

Les nouvelles colonnes :

```text
canonical_bucket_name
canonical_storage_path
canonical_mime_type
canonical_size_bytes
```

recevront plus tard la version universelle produite par le worker.

Sont également prévus :

- nom original ;
- clé client d'idempotence pour les reprises réseau ;
- protocole et progression d'upload ;
- type MIME réellement détecté ;
- empreinte SHA-256 ;
- version du pipeline ;
- progression ;
- erreurs structurées ;
- dates de traitement ;
- politique de rétention de l'original ;
- métadonnées JSON.

## 2. `publication_workspaces`

Un workspace représente un contenu Booster persistant, indépendamment de l'ordre des actions du professionnel.

Il peut contenir :

- l'idée et le thème ;
- les textes générés ;
- les canaux sélectionnés ;
- les options de génération ;
- les métadonnées de parcours ;
- l'état de publication ou de programmation ;
- une clé client d'idempotence.

États prévus :

```text
draft
active
waiting_media
ready
scheduled
publishing
published
failed
archived
```

Cette table permettra à terme de reprendre le même contenu après actualisation, fermeture ou changement d'appareil.

## 3. `publication_workspace_media`

Cette table attache les médias au workspace avec :

- leur ordre ;
- leur rôle ;
- les canaux concernés ;
- les réglages généraux ;
- les réglages par canal.

Le contrat produit est imposé directement en base :

```text
maximum 5 images
OU
1 seule vidéo
```

Le mélange image + vidéo est interdit.

Un verrou transactionnel par workspace empêche deux uploads terminés en même temps de dépasser la limite de cinq images.

Le trigger bloque également toute liaison entre un workspace et un média appartenant à deux établissements différents.

## 4. `media_variants`

Une variante représente une version dérivée d'un média, par exemple :

```text
canonical
ai_preview
thumbnail
channel_publish
video_frame
audio_track
```

Elle peut être globale au média ou spécifique à un workspace lorsque le cadrage choisi par le professionnel doit être conservé.

Chaque variante possède :

- un purpose ;
- un canal optionnel ;
- une signature stable ;
- un état ;
- son chemin Storage ;
- ses dimensions et sa durée ;
- la recette de transformation ;
- la version du pipeline.

Un index unique sur la signature empêche de recalculer inutilement la même variante.

## 5. `media_processing_jobs`

Cette table prépare une file persistante pour le futur worker Sharp / FFmpeg.

Elle comprend :

- type de tâche ;
- priorité ;
- progression ;
- nombre de tentatives ;
- reprise différée ;
- lease et verrou worker ;
- clé d'idempotence ;
- payload et résultat JSON ;
- erreurs structurées ;
- dates de démarrage et de fin.

États :

```text
queued
processing
retry_wait
succeeded
failed
cancelled
```

Les utilisateurs authentifiés peuvent consulter l'avancement de leurs médias. Seul le backend `service_role` peut créer ou modifier les variantes et les jobs.

## Sécurité

Toutes les nouvelles tables utilisent la RLS.

Le contrôle d'accès repose sur :

```text
public.inrcy_can_access_account(account_id)
```

Les protections ajoutées couvrent :

- lecture limitée aux établissements accessibles ;
- aucune exposition à `anon` ;
- blocage des liens cross-account ;
- variantes et jobs en lecture seule côté client ;
- écritures worker réservées au backend ;
- contrat 5 images ou 1 vidéo imposé en base.

La migration réaffirme aussi les policies multicompte de `pro_media_library`.

## Contrats TypeScript

Le fichier suivant décrit les états et les interfaces du registre :

```text
lib/mediaPipelineRegistry.ts
```

Il fournit notamment :

```text
validateWorkspaceMediaContract()
isMediaReadyForPurpose()
isMediaProcessingTerminal()
isMediaJobTerminal()
clampMediaProgress()
```

Ces fonctions évitent que les étapes suivantes réinventent des statuts ou des règles différentes selon Générer, Programmer ou Publier.

## Contrôle qualité

Commande complète :

```bash
npm run qa:media-pipeline:step2
```

Elle exécute :

1. tout le filet de sécurité de l'étape 1 ;
2. l'audit statique de la migration étape 2 ;
3. les tests du schéma ;
4. les tests des contrats TypeScript.

## Ce qui n'est volontairement pas encore activé

- upload direct universel dès l'insertion ;
- upload TUS résumable ;
- création automatique d'un workspace depuis Booster ;
- restauration par identifiants média ;
- conversion automatique des images ;
- compression automatique des vidéos ;
- worker dédié ;
- bascule de Générer / Programmer / Publier ;
- suppression des anciennes routes.

Ces éléments appartiennent aux étapes 3 à 8.

## Résultat de l'étape 2

La base peut désormais représenter proprement :

```text
un contenu persistant
+ ses 5 images ou sa vidéo
+ les versions IA et réseaux
+ les tâches de transformation
+ leur progression
+ leurs erreurs
```

Le tout sans modifier le fonctionnement actuel des professionnels.
