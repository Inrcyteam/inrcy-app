# Booster Publier — Étape 1 — Audit et sécurisation de `PublishModal`

Date : 31 juillet 2026

## Verdict

Le composant critique de publication et le nouveau pipeline média n'ont pas été modifiés par les refactorisations précédentes.

Les fichiers suivants sont **octet pour octet identiques** entre le ZIP d'origine `inrcy-app(43).zip` et le ZIP audité actuel :

- `app/dashboard/booster/publier/PublishModal.tsx` ;
- tout le dossier `app/dashboard/booster/publier/` ;
- `app/dashboard/_components/DashboardBoosterModalLayer.tsx` ;
- `app/api/booster/publish-now/route.ts` ;
- `lib/boosterPublishClient.ts` ;
- `lib/mediaWorkspaceClient.ts` ;
- `lib/universalMediaUploadClient.ts` ;
- les politiques client de consommation unifiée, de cutover historique et de compatibilité vidéo.

Cette étape ne modifie donc **aucun comportement de production**. Elle ajoute uniquement un test de contrat destiné à empêcher une future régression accidentelle.

## Périmètre contrôlé

L'audit couvre le parcours complet :

1. insertion d'images ou d'une vidéo ;
2. synchronisation immédiate dans le workspace média privé ;
3. génération IA ;
4. brouillons et restauration ;
5. revue finale ;
6. publication immédiate ;
7. publication asynchrone par canal ;
8. succès partiel et relance ciblée ;
9. programmation générale ou par canal ;
10. TikTok, Pinterest et variantes vidéo ;
11. archivage du workspace après succès complet.

## Cartographie du composant

`PublishModal.tsx` contient actuellement :

- 5 899 lignes ;
- 43 imports ;
- 69 états React ;
- 22 références React ;
- 33 effets React ;
- 10 callbacks mémorisés ;
- 8 valeurs mémorisées ;
- environ 79 fonctions internes.

Le composant est donc très sensible. Il ne doit pas subir un découpage massif ni une réécriture globale.

Il délègue toutefois déjà les domaines les plus techniques à :

- `usePersistentMediaWorkspace.ts` ;
- `usePublishImageController.ts` ;
- `usePublishVideoController.ts` ;
- `publishModal.shared.tsx` ;
- plusieurs composants visuels spécialisés.

## Contrat du nouveau pipeline média

### Insertion et upload

- cinq images maximum ;
- 50 Mo maximum par image ;
- 150 Mo maximum pour l'ensemble des images ;
- une vidéo source jusqu'à 300 Mo ;
- trois uploads image maximum en parallèle ;
- un seul upload vidéo à la fois ;
- chaque nouvelle opération annule proprement l'ancienne grâce à `AbortController` et à un numéro de version ;
- les opérations sont sérialisées afin d'éviter qu'un ancien upload remplace un média plus récent.

### Workspace obligatoire

Les trois actions critiques appellent la même attente de préparation :

- `waitForPersistentWorkspaceReadiness("generate")` ;
- `waitForPersistentWorkspaceReadiness("publish")` ;
- `waitForPersistentWorkspaceReadiness("schedule")`.

Le client attend donc l'upload et l'état serveur réellement exploitable avant de poursuivre.

### Cutover final

Lorsque le cutover est actif :

- le client transmet `mediaWorkspaceId` et `mediaWorkspaceClientKey` ;
- `imagesForAI` devient vide ;
- le nombre d'images IA transmis par le navigateur devient zéro ;
- les payloads de publication et de programmation conservent `images: []` ;
- le serveur relit les médias depuis le registre privé ;
- les anciens uploads restent uniquement dans la branche `!mediaPipelineCutoverEnabled`.

Il n'existe donc pas de double transport actif dans le parcours final.

### Vidéo et absence de double réencodage

Une source MP4/M4V déjà compatible est reconnue par `canPublishVideoSourceDirectly`.

Dans ce cas :

- le workspace est considéré prêt après sécurisation de la source ;
- aucun réencodage silencieux n'est lancé ;
- Publier et Programmer utilisent la source originale lorsqu'elle respecte la politique du canal ;
- une variante n'est produite automatiquement que lorsque le professionnel demande explicitement une adaptation ;
- une source incompatible reste bloquée avec la raison réelle.

## Génération IA

La génération :

1. vérifie les canaux et l'idée ;
2. confirme le remplacement d'un contenu déjà écrit ;
3. attend le workspace ;
4. utilise le workspace en mode cutover ;
5. conserve l'ancien parcours uniquement lorsque le cutover est désactivé ;
6. réutilise les caches locaux de captures et de piste audio ;
7. conserve le fallback de génération lorsqu'une transcription vidéo n'est pas disponible.

La route serveur échoue explicitement si le client demande le cutover avec un média attendu mais sans workspace exploitable.

## Publication immédiate

Avant l'envoi, `buildFinalReviewItems` réapplique les exigences propres à chaque canal.

Protections confirmées :

- aucun envoi sans canal sélectionné ;
- les canaux bloqués ne sont pas envoyés ;
- Instagram exige une image ou une vidéo ;
- Pinterest exige un média et un tableau ;
- les durées, formats et poids vidéo sont contrôlés par canal ;
- les CTA structurés sont nettoyés avant le payload final ;
- la publication passe par `trackEvent`, puis `postBoosterPublication` ;
- aucune requête directe fragile vers `publish-now` n'est construite dans `PublishModal`.

## Idempotence et publication asynchrone

Le transport conserve :

- une clé d'idempotence stable pendant les reprises réseau ;
- une tâche durable indépendante par canal ;
- une réponse HTTP 202 ;
- un polling de l'état final ;
- une agrégation canal par canal ;
- une relance limitée aux canaux en échec et encore relançables.

En cas de réponse réseau perdue après le début de l'envoi, le message demande toujours de vérifier iNrSend avant une nouvelle tentative.

## Succès partiel

Le comportement important est bien conservé :

- un succès partiel n'archive pas le workspace ;
- la modale principale ne se ferme pas ;
- seuls les canaux `ok === false` et `retryable !== false` sont proposés à la relance ;
- le workspace est archivé uniquement lorsque `failureCount === 0`.

## Programmation

La programmation :

- attend elle aussi le workspace et les variantes nécessaires ;
- regroupe les canaux qui partagent le même créneau ;
- enregistre `mediaWorkspaceId`, les modes médias et réglages par canal ;
- utilise le fuseau `Europe/Paris` ;
- sépare les canaux programmés des canaux à publier immédiatement ;
- demande les paramètres TikTok avant de programmer ou d'envoyer TikTok.

## Brouillons

En mode cutover :

- le brouillon ne réuploade pas les médias ;
- il conserve la référence du workspace ;
- le workspace est lié à l'identifiant du brouillon ;
- la réouverture adopte le workspace existant ;
- les fichiers, aperçus, dimensions, formats et variantes sont reconstruits depuis le registre.

## Contrôles automatiques réalisés

- comparaison origine/final de tout le dossier Publier : identique ;
- 1 253 fichiers TypeScript analysés : zéro erreur de syntaxe ;
- 3 656 imports internes vérifiés : aucun import cassé, hors fichier `.next` généré absent du ZIP ;
- audits pipeline média étapes 1 à 10 : réussis ;
- audit Pinterest Standard : 38/38 ;
- audits multi-compte : réussis ;
- tests ciblés Booster, Dashboard, contenu, Pinterest, TikTok, iNrAgent et règles médias : 73/73 avant ajout du nouveau contrat ;
- nouveau test de contrat `booster-publishmodal-critical-contract.test.mts` : 12/12 ;
- batterie complète exécutable sans les trois tests nécessitant `sharp` ou `bmp-js` : 634/634.

## Fichier ajouté

`tests/dashboard/booster-publishmodal-critical-contract.test.mts`

Ce test verrouille notamment :

- l'usage des trois contrôleurs médias ;
- l'attente du workspace pour Générer, Publier et Programmer ;
- l'absence de binaires dans les payloads cutover ;
- l'isolation du parcours historique ;
- la réutilisation de la vidéo originale compatible ;
- la sérialisation et l'annulation des uploads ;
- les limites médias centralisées ;
- la revue finale ;
- l'idempotence et l'asynchronisme ;
- le succès partiel ;
- la programmation ;
- les brouillons ;
- le message de prudence en cas d'incertitude réseau.

Le test est automatiquement inclus par la commande existante :

```bash
npm run test:dashboard
```

## Risques résiduels

Aucune erreur fonctionnelle n'a été détectée pendant cet audit.

Le principal risque est architectural : `PublishModal.tsx` reste très volumineux et possède beaucoup d'états et d'effets interdépendants. Une extraction future doit donc respecter les règles suivantes :

1. une seule responsabilité déplacée par étape ;
2. aucun changement simultané du JSX et de la logique métier ;
3. conservation exacte de l'ordre des hooks ;
4. comparaison automatique des payloads avant/après ;
5. test manuel obligatoire pour une image, cinq images, une vidéo compatible, une vidéo nécessitant une variante, succès partiel, programmation générale et programmation par canal.

## Recommandation pour l'étape suivante

Ne pas déplacer immédiatement `runPublish`, `performSchedulePublication`, la restauration de brouillon ou l'orchestration du workspace.

La prochaine étape sûre serait limitée aux **types, constantes et fonctions pures situées avant le composant**, sans toucher aux hooks, aux états, aux effets, aux payloads ni au JSX.
