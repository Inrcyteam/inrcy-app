# Booster PublishModal — Étape 2 : fondations sûres

Date : 31 juillet 2026

## Objectif

Réduire la taille de `PublishModal.tsx` sans toucher au nouveau système de publication ni au pipeline média.

## Périmètre déplacé

Un seul module de fondations a été ajouté :

- `app/dashboard/booster/publier/publishModal.foundations.ts`

Il contient uniquement :

- 7 types ;
- 5 constantes ;
- 21 fonctions pures de validation, normalisation, présentation et métadonnées vidéo.

## Éléments volontairement laissés dans PublishModal

Aucun élément ayant un effet de bord n'a été déplacé :

- hooks React ;
- appels API et Supabase ;
- `fetch` de transcription ;
- accès DOM, `window`, `document` ou Object URL ;
- contrôleurs images et vidéo ;
- workspace média persistant ;
- génération, publication, programmation et brouillons ;
- payloads et JSX.

## Garanties vérifiées

- corps complet du composant `PublishModal` strictement identique ;
- 33 déclarations déplacées avec un contenu strictement identique ;
- aucun cycle d'import ;
- aucun import interne cassé ;
- aucun nouveau diagnostic TypeScript de production ;
- 637 tests exécutables réussis ;
- 16 audits internes réussis ;
- pipeline média et routes de publication inchangés octet pour octet.

## Tests adaptés

Deux tests d'architecture lisent désormais le nouveau module pour les déclarations qui y ont été déplacées. Un test supplémentaire interdit l'ajout futur de hooks, réseau, DOM ou workspace média dans ce module de fondations.
