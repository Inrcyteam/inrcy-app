# Booster Publier — Étape 2 : pipeline média séparé

## Objectif

Un média ajouté dans Booster ne déclenche plus automatiquement tous les traitements disponibles. Le pipeline distingue désormais trois missions explicites et réutilise le même original ainsi que le même workspace.

## Missions

### 1. `source_metadata`

Déclenchée à l’ajout d’un média, quel que soit le mode de création.

- création ou réutilisation du workspace ;
- upload idempotent de l’original ;
- poids, type MIME, format/conteneur, dimensions, durée, orientation ;
- codecs fournis lorsqu’ils sont connus, sinon marqués en attente de sonde serveur ;
- miniature d’interface uniquement pour les formats que le navigateur affiche mal (HEIC, HEIF, TIFF, BMP).

Cette mission ne crée ni aperçu IA, ni captures vidéo, ni audio, ni canonique de publication.

### 2. `ai_preparation`

Déclenchée seulement par **Générer avec iNrCy**.

- image : aperçu IA uniquement ;
- vidéo : référence IA, miniature, trois captures et piste audio ;
- transcription réalisée ensuite par le parcours de génération à partir de la piste audio ;
- aucun MP4 canonique de publication n’est fabriqué pour analyser une vidéo.

### 3. `publication_preparation`

Déclenchée seulement avant publier ou programmer.

- réutilisation directe de l’original vidéo lorsqu’il est compatible ;
- image incompatible : canonique minimal ;
- vidéo incompatible : canonique minimal et miniature ;
- les contrôles par canal et les variantes choisies par le professionnel restent dans le préchauffage de publication existant ;
- Pinterest, les limites de durée, les dimensions, le poids, les codecs et l’isolation des canaux restent conservés.

## Idempotence et reprises

- un upload déjà terminé est réattaché sans nouvel envoi ;
- une préparation déjà en cours est partagée côté client ;
- une variante prête est réutilisée ;
- une reprise de worker conserve la mission qui a échoué ;
- un échec IA ne condamne pas la préparation publication, et inversement ;
- un canonique déjà prêt reste publiable après une préparation IA.

## Invariants conservés

- cinq images maximum ;
- une vidéo maximum ;
- aucune bordure, aucun recadrage ou changement de ratio silencieux ;
- originales conservées ;
- publication immédiate et programmée inchangées ;
- nouvelle tentative, suivi et annulation inchangés ;
- pipeline historique conservé derrière les flags existants.

## Validation ciblée

- tests d’architecture Étape 2 : 7/7 ;
- batterie média ciblée : 133/134 ;
- l’unique échec restant est le test TikTok déjà en échec dans le ZIP Étape 1 ;
- analyse TypeScript sans émission et sans vérification de dépendances : OK ;
- `git diff --check` : OK.

Le lint, le build et le TypeScript complet nécessitent l’installation des dépendances. Dans l’environnement de travail, `npm ci` est bloqué par une archive `zod-validation-error-4.0.2.tgz` absente du registre npm configuré.
