# Booster Publier — Étape 5 — Certification finale

Date : 4 août 2026

## Périmètre certifié

Cette certification part du ZIP Étape 4 et verrouille les cinq étapes du chantier Booster Publier :

1. choix persistant entre « Créer avec iNrCy » et « Créer manuellement » ;
2. séparation source / préparation IA / préparation publication ;
3. deux parcours complets et isolés ;
4. moteur final commun, idempotent et original-first ;
5. non-régression des publications, de Pinterest, d’iNrAgent et d’iNrSend.

## Scénarios produit

Les 16 scénarios demandés disposent désormais d’un test dédié dans
`tests/certification/booster-step5-certification.test.mts` :

- IA sans média ;
- IA avec images ;
- IA avec vidéo ;
- IA puis média ajouté uniquement dans « Médias de la publication » ;
- manuel avec images ;
- manuel avec vidéo ;
- changement IA vers Manuel ;
- changement Manuel vers IA ;
- Pinterest avec cinq images ;
- vidéo trop longue pour un seul canal ;
- média original compatible ;
- média nécessitant réellement une conversion ;
- publication immédiate ;
- publication programmée ;
- nouvelle tentative, suivi et annulation ;
- iNrAgent et iNrSend.

Résultat : **16/16 réussis**.

## Résultats automatisés

### Certification fonctionnelle

- scénarios Étape 5, dashboard, moteur de publication, Pinterest, iNrAgent,
  iNrSend et sécurité du contenu : **324/324** ;
- règles médias partagées : **4/4** ;
- pipeline média JavaScript : **97/97** ;
- pipeline média TypeScript, y compris le traitement réel Sharp et le chemin
  de repli BMP : **60/60**.

Le registre interne ne fournissant pas `bmp-js`, le seul fixture BMP a été
exécuté avec une implémentation de test isolée compatible 24 bits. Elle sert
uniquement à alimenter le normaliseur avec un vrai fichier BMP 2 × 2 et n'est
pas incluse dans le ZIP final. Sharp, lui, est bien exécuté réellement.

Total ciblé de l’Étape 5 : **485/485 tests réussis**.

### TypeScript, lint et build

L’installation complète des dépendances n’a pas pu être reconstruite dans le
sandbox de certification :

- le registre npm interne répond 404 pour
  `zod-validation-error-4.0.2.tgz` et pour `bmp-js` ;
- le registre npm public n’est pas joignable depuis ce sandbox (`EAI_AGAIN`).

Les trois commandes ont tout de même été lancées afin d'enregistrer leur état exact :

- `npm run typecheck` démarre, puis s'arrête uniquement sur des définitions de
  types absentes du `node_modules` incomplet (`node`, `react`, `react-dom`,
  `nodemailer`, etc.) ;
- `npm run lint` ne démarre pas car l'exécutable `eslint` n'a pas été installé ;
- `npm run build` exécute correctement le nettoyage préalable, puis ne démarre
  pas Next.js car l'exécutable `next` n'a pas été installé.

Aucun diagnostic applicatif TypeScript, ESLint ou Next.js ne peut donc être
conclu à partir de ces trois sorties. En complément, les **1 340 fichiers
TypeScript/TSX/MTS/CTS** du projet ont été analysés syntaxiquement avec le
parseur TypeScript : **0 erreur de parsing**. Toute la batterie ciblée est verte.

## Comparaison des traitements et encodages

La comparaison est effectuée entre le ZIP Étape 1 et le moteur final Étape 5.
Il s’agit de déclenchements architecturaux ; lorsqu’une signature identique est
dédupliquée par le workspace, le nombre réel d’exécutions FFmpeg peut déjà être
inférieur au maximum indiqué.

| Cas | Étape 1 | Étape 5 | Gain |
|---|---:|---:|---:|
| Préparation lourde automatique à l’ajout d’un média non direct | 1 | 0 | -100 % |
| Préchauffages image automatiques avant publication | jusqu’à 2 | 0 | -100 % |
| Préparation IA en parcours manuel | jusqu’à 4 artefacts vidéo IA | 0 | -100 % |
| Variantes imposées pour une vidéo originale compatible sur 7 canaux externes | jusqu’à 7 | 0 | -100 % |
| Upload de l’original lorsqu’il est réutilisé entre IA et publication | 1 | 1 | aucun doublon |
| Conversion d’une source réellement incompatible | à la préparation globale | 1 variante minimale ciblée | travail isolé |

### Origine des gains

Dans l’Étape 1, l’insertion appelait automatiquement
`prepareMediaPublicationWorkspace`, puis un préchauffage image après la
préparation et un autre lors des changements de paramètres. Le moteur final
n’effectue plus que l’upload `workspace_source` à l’insertion. Les missions
`ai_preparation` et `publication_preparation` sont déclenchées explicitement au
moment utile.

L’Étape 1 contenait aussi `requiresPreparedNetworkVideoVariant`, qui imposait
une variante à tous les canaux sauf les trois surfaces iNrCy. Cette règle a été
supprimée. Le moteur final valide d’abord l’original pour chaque canal et ne
réclame une variante que lorsque cette source est réellement incompatible.

## Commandes ajoutées

- `npm run test:booster-step5` : exécute les 16 scénarios produit ;
- `npm run certify:booster-step5` : exécute la certification ciblée complète ;
- `npm run certify:booster-step5:full` : ajoute TypeScript, lint et build dans
  un environnement disposant des dépendances installées.

## Conclusion

Les deux parcours utilisent désormais le même moteur final sans partager leurs
traitements IA. L’original est conservé et envoyé dès qu’un canal l’accepte ;
les conversions sont minimales, persistantes et isolées au canal qui les exige.
Aucune régression n’a été détectée dans les 485 contrôles ciblés.
