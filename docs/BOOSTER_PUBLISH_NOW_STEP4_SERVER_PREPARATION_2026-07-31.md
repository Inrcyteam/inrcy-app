# Booster Publish Now — Étape 4 — Préparation serveur isolée

Date : 31 juillet 2026

## Objectif

Réduire la taille de `app/api/booster/publish-now/route.ts` sans modifier le moteur réel de publication ni les branches propres aux réseaux sociaux.

L'étape isole uniquement les opérations techniques exécutées avant ou autour du dispatch :

- déchiffrement et déduplication des jetons Instagram/Facebook candidats ;
- normalisation du payload vidéo historique ;
- résolution des fichiers image depuis Storage, URL publique ou Data URL ;
- création d'URL signées ;
- optimisation et stockage des variantes image ;
- détection des erreurs image Google Business ;
- lecture de la dernière intégration correspondante.

## Modifications

### Fichier principal

`app/api/booster/publish-now/route.ts`

- avant : 4 505 lignes ;
- après : 3 784 lignes ;
- réduction : 721 lignes.

### Nouveau module serveur

`app/api/booster/publish-now/publishNow.server-preparation.ts`

- 741 lignes ;
- 12 déclarations déplacées ;
- cinq fonctions exposées à la route ;
- les sous-fonctions internes restent privées au module.

## Garantie de fidélité

Le contenu de chaque déclaration déplacée a été comparé à l'étape 3 après retrait du seul mot-clé `export` : 12 sur 12 sont identiques.

La fonction complète `publishNowHandler` est strictement identique :

- longueur avant : 131 791 caractères ;
- longueur après : 131 791 caractères ;
- SHA-256 identique : `67c1bd2d0807e045ff087c2ba84a5d901f71e11be659e9a1aaaffb778f9378df`.

## Éléments volontairement laissés dans la route

- authentification et rate limiting ;
- validation des canaux ;
- workspace média et cutover ;
- verrous parent et par canal ;
- fan-out asynchrone ;
- persistance des publications et livraisons ;
- appels Facebook, Instagram, LinkedIn, TikTok, YouTube, Pinterest et Google Business ;
- gestion Site iNrCy et iNrSearch ;
- agrégation des succès partiels et finalisation.

Le nouveau module ne contient aucun handler HTTP, aucune acquisition de verrou, aucune finalisation asynchrone et aucun appel de publication vers un réseau.

## Tests et audits

- 75 tests Dashboard réussis ;
- 675 tests source exécutables réussis ;
- 16 audits internes réussis ;
- 1 262 fichiers TypeScript analysés sans erreur de syntaxe ;
- 4 850 imports analysés, aucun import interne cassé ;
- aucun cycle impliquant `publish-now` ;
- aucun diagnostic TypeScript inattendu ajouté après comparaison avec l'étape 3.

Deux tests nécessitant les paquets natifs `bmp-js` et `sharp` n'ont pas pu être démarrés dans cet environnement sans `node_modules`.

Les diagnostics supplémentaires observés par le typecheck brut concernent uniquement les types Node absents localement (`Buffer`, `crypto`, `node:test`, `node:fs`, `node:assert`). Ces types figurent déjà dans les dépendances de développement du projet.

## Fichiers de contrôle adaptés

Les tests et audits qui lisaient historiquement uniquement `route.ts` lisent désormais l'ensemble :

- `route.ts` ;
- `publishNow.server-preparation.ts`.

Les assertions métier ont été conservées. Elles n'ont pas été supprimées ni assouplies.

## Verdict

Cette étape est un déplacement structurel serveur sans changement fonctionnel. Le moteur de publication, les payloads, les médias, les verrous et les branches par canal restent inchangés.
