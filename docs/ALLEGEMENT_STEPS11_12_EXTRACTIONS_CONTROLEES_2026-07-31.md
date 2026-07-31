# Allègement — Étapes 11 et 12 — Extractions contrôlées

Date : 31 juillet 2026

## Objectif

Réduire deux composants centraux en déplaçant uniquement des blocs autonomes, sans modifier leur logique, leurs appels, leur ordre d’exécution ou leur rendu.

## Étape 11 — Runtime vidéo IA de PublishModal

- `app/dashboard/booster/publier/PublishModal.tsx` : 5 571 → 5 415 lignes.
- Réduction du composant : 156 lignes.
- Nouveau module : `app/dashboard/booster/publier/publishModal.videoAiRuntime.ts` (168 lignes).
- Fonctions déplacées :
  - préchargement de l’aperçu image préparé ;
  - lecture des métadonnées de la vidéo source ;
  - transcription de la piste audio destinée à l’IA.
- Les appels restent aux mêmes emplacements dans `PublishModal.tsx`.
- Aucun hook React, état, effet, JSX, contrôleur média ou parcours de publication n’a été déplacé.

## Étape 12 — Fondations vidéo de MailboxClient

- `app/dashboard/mails/MailboxClient.tsx` : 5 148 → 5 022 lignes.
- Réduction du composant : 126 lignes.
- Nouveau module : `app/dashboard/mails/_lib/mailboxPublicationVideo.foundations.ts` (143 lignes).
- Éléments déplacés :
  - types d’état vidéo et de notification de distribution ;
  - normalisation du canal vidéo ;
  - conversion d’une pièce jointe en payload vidéo ;
  - lecture des métadonnées vidéo de modification de publication.
- Les états React, appels réseau, transformations, sauvegardes et actions de publication restent dans `MailboxClient.tsx`.

## Garanties de comparaison

Les deux blocs ont été comparés automatiquement avec leur source d’origine. Leurs instructions sont strictement identiques. Les seules adaptations sont les mots-clés `export`, les imports nécessaires et les imports effectués par les composants d’origine.

Aucun fichier applicatif n’a été supprimé. Aucun SQL, route API, CSS, asset, hook ou composant visuel n’a été modifié.

## Certification locale

- 692/692 tests Node exécutables réussis.
- 12/12 audits transverses réussis : multicompte, AI Gateway et pipeline média étapes 1 à 10.
- 38/38 contrôles Pinterest Standard réussis.
- 9/9 tests Pinterest réussis.
- Analyse syntaxique TypeScript réussie sur tous les fichiers modifiés ou ajoutés.
- Aucun cycle direct entre les nouveaux modules et leurs composants d’origine.

Deux fichiers de tests binaires ne peuvent pas démarrer localement sans `sharp` et `bmp-js`. Le lint, le typecheck complet et le build doivent être confirmés par la CI, car `node_modules` n’est pas inclus dans l’archive.

## Résultat

Les deux composants perdent ensemble 282 lignes. Le code n’est pas supprimé : il est rangé dans deux modules spécialisés afin de rendre les fichiers centraux plus courts et plus lisibles.
