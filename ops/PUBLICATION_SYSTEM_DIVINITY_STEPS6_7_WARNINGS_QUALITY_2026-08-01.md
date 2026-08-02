# Systeme de publication - Etapes 6 et 7 - Bilan, qualite et performance

Date : 2026-08-01

## Objectif

Finaliser sans refonte les deux contrats suivants :

1. une publication dont le texte est bien publie mais dont le media echoue reste un succes explicite avec avertissement ;
2. les originaux transparents restent transparents sur les surfaces iNrCy compatibles, tandis que les connecteurs sociaux conservent des formats legers et fiables.

Aucune migration SQL n'est requise.

## Etape 6 - Publication publiee avec avertissement

Un contrat commun centralise maintenant la classification des resultats :

- `published` : publication conforme ;
- `published_with_warning` : publication terminee avec degradation ;
- `processing` : traitement externe reellement en cours, notamment TikTok ;
- `failed` : publication non publiee.

Les codes media reconnus incluent notamment :

- `published_without_image` ;
- `published_without_video` ;
- `published_without_media` ;
- `published_without_media_and_cta` ;
- `published_after_retry_without_image` ;
- `published_with_partial_images`.

Les bilans immediats et asynchrones remontent desormais :

- le nombre de publications conformes ;
- le nombre de publications avec avertissement ;
- le nombre d'avertissements media ;
- le nombre de canaux encore en traitement ;
- le nombre d'echecs.

Le message utilisateur indique qu'un autre media peut etre ajoute depuis iNrSend ou directement sur le canal. Les erreurs techniques detaillees restent disponibles dans les diagnostics.

## Etape 7 - Qualite, transparence, fiabilite et vitesse

### Transparence

Les images PNG, WebP ou AVIF publiees en original vers les surfaces suivantes sont rendues en PNG avec canal alpha conserve :

- Site iNrCy ;
- Site web ;
- iNrSearch.

Les canaux sociaux opaques restent en JPEG optimise. Le numero de version du pipeline image a ete incremente afin de ne pas reutiliser d'anciens JPEG blancs depuis le cache.

Aucun fond floute n'a ete ajoute ou reactive.

### Facebook

- les images sont envoyees avec une concurrence maximale de deux uploads ;
- l'ordre original est conserve dans le carrousel ;
- si certaines images echouent, le post est publie avec les images acceptees et un avertissement ;
- si toutes les images echouent, le texte reste publie avec un avertissement ;
- si la video echoue, un fallback texte seul est tente avec avertissement ;
- les diagnostics conservent le detail de chaque media refuse.

### LinkedIn

Si une image, un carrousel ou une video echoue mais que le texte peut etre publie, la publication est terminee avec avertissement au lieu d'etre declaree integralement en echec.

### TikTok

Un statut TikTok non terminal reste classe `processing`, meme si le connecteur ne fournit pas de message d'avertissement. Un avertissement media termine ne peut plus etre confondu avec un traitement externe en cours.

## Fichiers structurants ajoutes

- `lib/boosterPublicationOutcome.ts`
- `lib/boosterImageOutputPolicy.ts`
- `scripts/audit-publication-system-step6.mjs`
- `scripts/audit-publication-system-step7.mjs`
- `tests/publication-system/publication-system-step6-warning-outcomes.test.mts`
- `tests/publication-system/publication-system-step7-quality-performance.test.mts`

## Certification

- audit et tests Etape 6 : valides ;
- audit et tests Etape 7 : valides ;
- Etapes 1 a 5 : conservees ;
- dashboard : 109/109 ;
- Booster images : 27/27 ;
- iNrSend : 51/51 ;
- regles medias : 4/4 ;
- politique de normalisation image : 4/4 ;
- TypeScript complet : valide ;
- lint de tous les fichiers modifies : valide.

Le build Next n'a pas pu etre execute dans l'environnement d'audit car le binaire SWC Linux n'est pas present dans le jeu de dependances externe disponible. Cette limite n'est pas une erreur TypeScript ou un echec de test applicatif. Le deploiement doit reconstruire ses dependances avec `npm ci` sur l'environnement Linux cible.
