# Booster Publish Now — Étape 3 : fondations pures

Date : 31 juillet 2026

## Objectif

Réduire la taille de `app/api/booster/publish-now/route.ts` sans modifier le moteur de publication, les appels réseau, les payloads médias, les verrous d’idempotence, le fan-out asynchrone ni les branches propres aux canaux.

## Modifications

- Ajout de `app/api/booster/publish-now/publishNow.foundations.ts`.
- Extraction mécanique de 39 déclarations :
  - 13 types ;
  - 7 constantes ;
  - 19 fonctions déterministes.
- `route.ts` passe de 4 975 à 4 505 lignes.
- Les deux utilitaires utilisant directement `Buffer` restent volontairement dans la route afin de ne pas créer de nouveau diagnostic Node dans le module pur.

## Périmètre extrait

- modèles de payloads images/vidéo et publications par canal ;
- normalisation des modes médias et réglages TikTok ;
- résumé des résultats et politique de relance ;
- clés et métadonnées d’idempotence ;
- messages de doublon programmé ;
- normalisation des hashtags, URLs et extensions d’images ;
- choix des formats d’optimisation d’images ;
- préparation des pièces jointes éditables ;
- payloads images préparés pour le fan-out asynchrone.

## Périmètre laissé dans la route

- authentification et rate limiting ;
- accès Supabase et stockage ;
- déchiffrement des jetons OAuth ;
- consommation du workspace média ;
- préparation serveur des variantes images/vidéo ;
- acquisition et finalisation des verrous ;
- fan-out asynchrone et persistance des livraisons ;
- toutes les implémentations Facebook, Instagram, LinkedIn, TikTok, YouTube, Pinterest, Google Business, site iNrCy et iNrSearch.

## Preuves de fidélité

- 39/39 déclarations extraites identiques au caractère près hors ajout du mot-clé `export`.
- `publishNowHandler` identique au caractère près :
  - longueur : 131 791 caractères ;
  - SHA-256 avant/après : `67c1bd2d0807e045ff087c2ba84a5d901f71e11be659e9a1aaaffb778f9378df`.
- Aucun import inutilisé dans la route ou le nouveau module.
- Aucun cycle impliquant le nouveau module.
- Aucun import interne cassé.
- Aucun nouveau diagnostic TypeScript de production par rapport à l’étape 2.

## Tests et audits

- 72/72 tests Dashboard.
- 672/672 tests source exécutables.
- 16/16 audits internes.
- 1 260 fichiers TypeScript analysés : aucune erreur de syntaxe.
- Deux fichiers de tests non exécutables localement faute de dépendances installées :
  - `media-pipeline-bmp-normalization.test.mts` (`bmp-js`) ;
  - `media-pipeline-production-regressions.test.mts` (`sharp`).

## Garde-fou ajouté

`booster-publish-now-foundations-contract.test.mts` interdit au module de fondations d’introduire :

- réseau ou `fetch` ;
- Supabase ou stockage ;
- authentification ;
- verrous d’exécution ;
- préparation média serveur ;
- déchiffrement de jetons ;
- dispatch asynchrone ;
- intégrations propres aux réseaux.

## Verdict

Le moteur exécuté par `publish-now` reste strictement identique. Cette étape améliore uniquement la lisibilité et la maintenabilité de la route en isolant ses fondations déterministes.
