# iNrCy — Booster PublishNow — Étape 6 finale

## Audit final et certification des branches de publication

Date : 31 juillet 2026

## Objectif

Certifier l'état obtenu après les étapes 1 à 5 sans effectuer de nouvelle extraction et sans modifier une ligne exécutée en production.

Cette étape vérifie :

- la structure complète de `publish-now` ;
- l'ordre et l'isolation des branches par canal ;
- les précontrôles, appels de publication et écritures de résultat ;
- la fermeture durable des erreurs ;
- le lien avec le fan-out asynchrone, le statut et le cron de récupération ;
- la frontière des trois modules déjà extraits ;
- l'opportunité ou non de poursuivre le découpage.

## Modification de production

**Aucune.**

Par rapport au ZIP de l'étape 5, le seul fichier de test ajouté avant cette documentation est :

- `tests/dashboard/booster-publish-now-final-certification.test.mts`.

Aucun fichier sous `app/`, `lib/`, `ops/`, aucun SQL, aucune configuration et aucune intégration réseau n'a été modifié.

## Architecture finale certifiée

### Route principale

- `app/api/booster/publish-now/route.ts` : 3 628 lignes ;
- la boucle de dispatch reste dans la route ;
- les branches réseau restent explicites et ordonnées ;
- chaque branche écrit son résultat et termine par `continue` ;
- un `catch` commun par canal transforme les exceptions en livraison `failed` ;
- le fallback `unsupported_channel` reste terminal et non retentable.

### Modules déjà isolés

1. `publishNow.foundations.ts`
   - types, constantes et fonctions déterministes ;
   - aucun réseau, base de données ou réponse HTTP.

2. `publishNow.server-preparation.ts`
   - préparation serveur, Storage, URLs signées, optimisation des images et normalisation vidéo ;
   - aucun appel de publication vers un réseau social.

3. `publishNow.channel-context.ts`
   - choix déterministe du contenu, des images et de la variante vidéo par canal ;
   - aucun réseau, token, verrou ou persistance.

## Audit branche par branche

| Branche | Lignes | Taille approximative | Dépendances externes locales | Verdict |
|---|---:|---:|---:|---|
| iNrSearch | 1 750–1 775 | 1 218 caractères | 10 | Petite, mais liée aux droits, au statut public et à la livraison. Ne pas extraire sans besoin fonctionnel. |
| Sites iNrCy / externe | 1 787–1 917 | 5 221 caractères | 20 | Étroitement liée aux URLs, médias, Supabase et erreurs. À conserver dans l'orchestrateur. |
| Facebook | 1 919–2 035 | 3 891 caractères | 20 | Token, expiration, vidéo/image et statut durable sont couplés. Extraction non utile aujourd'hui. |
| Instagram | 2 037–2 173 | 4 975 caractères | 28 | Plusieurs fallbacks de tokens et trois modes de publication. Risque élevé de déplacement. |
| LinkedIn | 2 175–2 410 | 8 405 caractères | 24 | Organisation, profil personnel, fallback texte et plusieurs types de média. Forte orchestration. |
| YouTube | 2 412–2 561 | 5 741 caractères | 21 | Token rafraîchi, validation vidéo, format Short/vidéo et métadonnées. À laisser groupé. |
| TikTok | 2 563–2 837 | 11 635 caractères | 31 | Branche la plus couplée : Storage, proxy média, photos, vidéo fichier et paramètres TikTok. Ne pas extraire maintenant. |
| Pinterest | 2 839–3 025 | 6 868 caractères | 27 | Board, CTA, vidéo/image, lien public et fallbacks. Extraction risquée sans tests d'intégration API. |
| Google Business | 3 027–3 201 | 6 720 caractères | 25 | Token, médias, CTA et deux reprises automatiques. Doit rester lisible dans une seule unité transactionnelle. |

Les dépendances comptabilisées correspondent aux valeurs, fonctions et services capturés depuis l'orchestrateur. Une extraction imposerait aujourd'hui de transmettre des objets de contexte volumineux de 20 à 31 dépendances pour la plupart des réseaux.

## Raisons de ne pas effectuer une étape 7 de découpage global

Le code restant n'est plus du code utilitaire autonome. Il représente l'orchestration métier réelle :

- jetons et états d'intégration ;
- paramètres propres aux comptes et canaux ;
- choix média déjà préparé ;
- appels API externes ;
- messages utilisateur ;
- logs techniques ;
- écritures `publication_deliveries` ;
- résultat agrégé et finalisation asynchrone.

Déplacer ces branches n'abaisserait pas réellement la complexité. Elle serait transférée dans de gros objets de paramètres et rendrait les changements plus difficiles à suivre. Le rapport risque/bénéfice est donc désormais défavorable.

## Nouveau filet de certification

Le fichier `booster-publish-now-final-certification.test.mts` ajoute 7 contrôles :

1. inventaire et ordre exacts des branches ;
2. présence des précontrôles, publishers et mises à jour durables ;
3. absence d'appel à un publisher d'un autre canal dans une branche ;
4. fermeture terminale du fallback et du `catch` par canal ;
5. respect des responsabilités des trois modules extraits ;
6. continuité fan-out / statut / récupération ;
7. empreinte de la boucle complète de dispatch.

Empreinte certifiée de la région textuelle allant de `for (const ch of selected)` jusqu'avant `if (internalAsyncDispatch)` :

- longueur : 56 590 caractères ;
- SHA-256 : `3c13546a773656f1bbeb5a5cbd8aac2656e2c3ba0a34c8bc46eba3067b27d67f`.

Cette empreinte rendra toute future modification de la boucle visible et obligera à une mise à jour volontaire du test de certification.

## Résultats de validation

- 7/7 nouveaux tests de certification ;
- 86/86 tests Dashboard ;
- 688/688 tests source exécutables ;
- 130/130 fichiers de tests exécutables réussis ;
- 16/16 audits internes réussis ;
- 1 312 fichiers TypeScript/JavaScript analysés : 0 erreur de syntaxe ;
- 3 694 imports internes analysés : 0 import cassé ;
- 0 cycle autour de `publish-now`.

Deux tests ne peuvent pas démarrer dans cet environnement sans leurs dépendances natives installées :

- `media-pipeline-bmp-normalization.test.mts` : `bmp-js` absent ;
- `media-pipeline-production-regressions.test.mts` : `sharp` absent.

Le dossier `node_modules` est absent. Le lint ESLint, le typecheck complet et le build Next.js doivent donc toujours être confirmés par la CI avec les dépendances du projet.

## Verdict final

Le refactoring global de `publish-now` doit s'arrêter à cette étape.

La route a été réduite et clarifiée en isolant uniquement les fondations, la préparation serveur et le contexte déterministe. Le code restant correspond au moteur métier sensible. Une extraction supplémentaire n'est pas justifiée sans besoin fonctionnel précis et sans tests d'intégration réels du canal concerné.

Pour une évolution future, la règle recommandée est : **un seul canal à la fois, uniquement lorsqu'une modification fonctionnelle de ce canal l'exige, avec tests API dédiés avant et après**.
