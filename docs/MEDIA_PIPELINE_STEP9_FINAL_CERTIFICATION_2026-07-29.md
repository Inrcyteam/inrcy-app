# Pipeline média universel — Étape 9 — Certification finale

Date : 29 juillet 2026

## Objectif

Certifier l'ensemble des Étapes 1 à 8, rendre l'état des flags observable et
organiser une activation progressive qui puisse être interrompue sans retour
arrière SQL.

L'Étape 9 n'ajoute aucune nouvelle transformation média et ne retire pas
physiquement les routes historiques. Elle ajoute :

- une politique de cohérence des flags ;
- des paliers de déploiement nommés ;
- un contrôle du pipeline dans le healthcheck interne ;
- un smoke test post-déploiement ;
- une requête SQL finale en lecture seule ;
- une procédure d'exploitation et de rollback.

Il n'existe **aucune migration Étape 9** : le fichier SQL de cette étape est
uniquement un rapport de certification en lecture seule.

## Paliers certifiés

### `disabled`

Tous les flags sont coupés. Le code est déployé mais le comportement historique
reste actif.

### `server_foundation`

Les uploads, workspaces et workers image/vidéo sont prêts côté serveur. Aucun
client ne crée encore de workspace universel.

### `workspace_canary`

Le client test utilise l'upload direct et le workspace persistant. Générer,
Publier et Programmer conservent encore leur consommation historique.

### `unified_canary`

Le workspace est consommé par Générer, Publier et Programmer, mais la voie
historique reste disponible comme filet de sécurité.

### `full_cutover`

Tous les prérequis sont actifs et le navigateur ne renvoie plus les binaires
média vers les anciennes routes.

Toute combinaison qui active un enfant sans son prérequis est classée
`invalid` et fait échouer la vérification de déploiement ainsi que le
healthcheck interne.

## Certification locale

Commande principale :

```bash
npm run certify:media-pipeline
```

Elle rejoue :

- toutes les étapes du pipeline média ;
- les règles Booster images et médias ;
- les tests Pinterest ;
- les tests multicompte ;
- les tests iNrSend.

Certification avec vérification TypeScript complète :

```bash
npm run certify:media-pipeline:full
```

Contrôle isolé des flags du déploiement :

```bash
npm run verify:media-pipeline:rollout
```

Pour exiger le palier final dans un environnement de production :

```bash
REQUIRE_MEDIA_PIPELINE_CUTOVER=1 npm run verify:media-pipeline:rollout
```

## Contrôle SQL final

Après les migrations et vérifications Étapes 2 à 8, exécuter :

```text
ops/sql/2026-07-29_media_pipeline_step9_final_certification.sql
```

Le rapport vérifie :

- les cinq tables du registre ;
- les fonctions de cohérence et de workers ;
- les index de consommation et de publication ;
- les buckets `booster` et `inrcy-pro-media` ;
- le caractère privé de `inrcy-pro-media` ;
- la RLS des nouvelles tables ;
- les jobs en attente, en échec ou avec lease expirée ;
- les workspaces bloqués ;
- les variantes en échec ou bloquées.

Le fichier ne contient aucune instruction d'écriture.

## Healthcheck interne

`GET /api/health/internal` inclut maintenant le contrôle
`checks.media_pipeline` lorsque l'un des flags média est actif.

Il contrôle :

- la cohérence des dix flags ;
- l'accès aux cinq tables ;
- la présence des deux buckets ;
- le caractère privé du bucket source ;
- les jobs avec lease expirée ;
- les workspaces restés en publication plus de 30 minutes ;
- le nombre de jobs en échec sur 24 heures.

Le cron santé journalise également le palier et les métriques média.

Smoke test après chaque redéploiement :

```bash
APP_BASE_URL=https://app.inrcy.com \
HEALTHCHECK_TOKEN=... \
npm run smoke:media-pipeline
```

Au palier final :

```bash
APP_BASE_URL=https://app.inrcy.com \
HEALTHCHECK_TOKEN=... \
REQUIRE_MEDIA_PIPELINE_CUTOVER=1 \
npm run smoke:media-pipeline
```

## Activation progressive

La procédure opérateur complète se trouve dans :

```text
ops/MEDIA_PIPELINE_PRODUCTION_CUTOVER_2026-07-29.md
```

Résumé :

1. déployer le code avec tous les flags coupés ;
2. appliquer les migrations Étapes 2, 3, 5, 6, 7 et 8 ;
3. exécuter tous les SQL de vérification ;
4. activer le socle serveur ;
5. tester upload + workspace sur un compte interne ;
6. activer la consommation unifiée en canary ;
7. activer les deux flags de cutover ;
8. observer les crons, Sentry, Vercel et le SQL final.

Les variables `NEXT_PUBLIC_*` sont intégrées au build Next.js : chaque changement
de palier client exige un nouveau déploiement Vercel.

## Matrice de validation fonctionnelle

Avant le palier final, valider au minimum :

- publication texte sans média ;
- une image JPEG ;
- cinq images dans l'ordre ;
- PNG transparent ;
- HEIC provenant d'un iPhone ;
- image paysage et portrait avec cadrages différents par canal ;
- vidéo paysage avec son ;
- vidéo portrait avec rotation ;
- vidéo silencieuse ;
- génération IA avant et après ajout du média ;
- sauvegarde puis réouverture d'un brouillon ;
- publication immédiate ;
- programmation puis exécution par iNrAgent ;
- Pinterest multi-images ;
- TikTok et YouTube Shorts ;
- Facebook, Instagram, LinkedIn et Google Business ;
- compte principal et établissement secondaire.

## Seuils de rollback

Rollback immédiat si l'un de ces cas apparaît :

- fuite ou lecture inter-établissement ;
- source privée inaccessible alors que le workspace est `ready` ;
- trois smoke tests consécutifs en échec ;
- plus de 5 % d'échecs sur au moins 20 publications du canary ;
- upload réussi mais workspace bloqué plus de 15 minutes ;
- jobs avec lease expirée qui ne sont pas repris au cron suivant ;
- perte d'ordre, de cadrage ou de média entre brouillon et publication.

Le premier rollback consiste à couper uniquement les deux flags Étape 8. Aucun
SQL inverse n'est requis et toutes les données universelles restent conservées.

## Retrait futur du code historique

Les routes et helpers historiques restent présents après l'Étape 9 pour
sécuriser le retour arrière. Leur retrait physique ne doit être envisagé
qu'après une période d'observation stable en production, avec un nouveau lot
séparé et ses propres tests.
