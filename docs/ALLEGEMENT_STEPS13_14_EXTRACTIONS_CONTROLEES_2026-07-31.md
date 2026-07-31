# Allègement structurel — Étapes 13 et 14

Date : 31 juillet 2026

## Étape 13 — Helpers média iNrAgent

Fichier allégé : `app/dashboard/agent/AgentClient.tsx`

- Avant : 6 460 lignes.
- Après : 6 409 lignes.
- Réduction du composant : 51 lignes.
- Nouveau module : `app/dashboard/agent/_lib/agent.media-adapter.ts`.

Blocs déplacés sans réécriture métier :

- conversion d'une image Data URL en `File` ;
- calcul des décalages de recadrage ;
- téléchargement d'une URL média vers un `File`.

Les états React, hooks, JSX, appels Supabase et gestionnaires d'iNrAgent restent dans `AgentClient.tsx`.

## Étape 14 — Fondations des brouillons de publication iNrAgent

Fichier allégé : `app/api/agent/actions/route.ts`

- Avant : 2 479 lignes.
- Après : 2 094 lignes.
- Réduction de la route : 385 lignes.
- Nouveau module : `app/api/agent/actions/actionPublishDraft.foundations.ts`.

Blocs déplacés sans réécriture métier :

- types et aliases des canaux Booster ;
- nettoyage des textes, hashtags, posts et médias ;
- lecture des données par canal ;
- règles de média obligatoire et vidéo obligatoire ;
- calcul de l'état de préparation et de l'adaptation média ;
- normalisation de la liste des canaux ;
- détermination de l'extension d'un média.

Les handlers HTTP, accès Supabase, lectures binaires, copies Storage et sauvegardes de brouillons restent dans la route.

## Contrôles

- comparaison automatique des blocs déplacés avec la version source : identiques hors `export`, imports et équivalence de type ;
- analyse syntaxique TypeScript/TSX réussie ;
- résolution de tous les imports locaux TypeScript réussie ;
- aucun cycle direct entre les nouveaux modules et leurs fichiers d'origine ;
- 695 tests exécutables réussis sur 695 ;
- 12 audits statiques réussis sur 12 ;
- 38 contrôles Pinterest réussis sur 38 ;
- 9 tests Pinterest réussis sur 9.

Deux tests binaires ne démarrent pas dans l'archive sans `node_modules` : `bmp-js` et `sharp` sont absents. Le typecheck, le lint et le build complets restent à confirmer dans la CI avec les dépendances installées.
