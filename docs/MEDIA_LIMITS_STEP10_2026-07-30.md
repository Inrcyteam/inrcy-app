# Étape 10 — Limites médias et compression — 30 juillet 2026

## Objectif

Aligner les limites réellement acceptées par Booster / Publier, le transport direct, les workers de normalisation et les textes visibles dans l'application.

## Limites produit

- 5 images maximum par publication ;
- 50 Mo maximum par image ;
- 150 Mo maximum pour l'ensemble des images ;
- 1 vidéo source maximum ;
- 300 Mo maximum pour la vidéo source ;
- variante vidéo de publication plafonnée à 40 Mo lorsque le canal l'exige.

## Formats visibles dans Booster

- images : JPG, PNG, WebP, GIF, AVIF, HEIC et HEIF ;
- vidéos : MP4, M4V, MOV et WebM.

## Traitement

- l'upload direct ou résumable démarre dès l'insertion du média ;
- une action immédiate Générer, Publier ou Programmer attend la fin réelle de l'upload ;
- les images sont normalisées côté serveur et déclinées en canonique, aperçu IA et miniature ;
- la vidéo source est téléchargée en flux par le worker, normalisée puis compressée en variantes compatibles ;
- lorsque le cutover média est actif, une vidéo volumineuse n'est plus décodée inutilement dans le navigateur à son insertion ;
- les anciennes routes restent présentes comme filet de sécurité lorsque les flags de cutover sont désactivés.

## Interface Booster / Publier

Les sous-textes, résumés, infobulles, sélecteurs de fichiers et messages d'erreur utilisent désormais les mêmes constantes centrales. Ils indiquent les limites par fichier, le total des images, le plafond vidéo source et la préparation automatique.

## Déploiement

Aucun nouveau SQL et aucune nouvelle variable d'environnement ne sont nécessaires pour cette étape.
