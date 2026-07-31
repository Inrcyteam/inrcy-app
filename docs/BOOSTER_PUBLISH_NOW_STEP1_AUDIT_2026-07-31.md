# Booster `publish-now` — Étape 1 : audit et sécurisation

Date : 31 juillet 2026

## Périmètre

Cette étape est volontairement non intrusive. Aucun fichier exécuté en production n'est modifié. L'audit couvre :

- `app/api/booster/publish-now/route.ts` ;
- `lib/boosterAsyncPublication.ts` ;
- `lib/executionIdempotency.ts` ;
- le statut de publication asynchrone ;
- le cron de récupération ;
- les consommateurs du workspace média ;
- la préparation serveur des images et variantes vidéo.

Un test d'architecture statique a été ajouté dans :

- `tests/dashboard/booster-publish-now-critical-contract.test.mts`.

## Architecture confirmée

### 1. Entrée et sécurité

La route distingue trois chemins :

1. publication manuelle authentifiée avec limitation de débit ;
2. exécution programmée autorisée par le secret cron ;
3. worker asynchrone interne, également protégé par le secret cron.

Un dispatch asynchrone externe est refusé. Un worker interne doit cibler exactement un canal et fournir les identifiants techniques attendus.

### 2. Nouveau pipeline média

Lorsque `mediaPipelineCutoverV1` est actif :

- un workspace média est obligatoire dès qu'un canal utilise une image ou une vidéo ;
- le workspace est relu côté serveur avec le compte de l'utilisateur ;
- une incohérence entre type de média et canaux sélectionnés bloque l'envoi ;
- les images sont préparées côté serveur par canal ;
- les variantes vidéo sont relues sans lancer de nouvel encodage dans la route ;
- une source originale n'est acceptée que si la politique du canal la valide ;
- un média encore en préparation provoque une réponse contrôlée, pas un envoi dégradé.

### 3. Idempotence et doublons

La recherche d'une programmation similaire intervient avant l'acquisition du verrou parent. Le verrou d'exécution permet :

- de rejouer un résultat déjà terminé ;
- de refuser une seconde exécution concurrente avec HTTP 425 ;
- de rattacher la publication asynchrone au verrou parent ;
- de posséder un verrou distinct pour chaque canal.

### 4. Persistance et fan-out

Avant le dispatch asynchrone, la route persiste :

- la publication ;
- une livraison `queued` par canal ;
- un événement technique parent ;
- un événement technique par canal.

Le payload du worker ne transporte plus le workspace ni les binaires navigateur. Il reçoit les références préparées nécessaires au canal. La réponse parent est HTTP 202 et le client consulte ensuite le statut durable.

### 5. Résultats partiels

Chaque canal met à jour sa livraison et son événement technique. La finalisation attend que tous les événements soient terminaux, puis :

- agrège les résultats ;
- conserve uniquement les canaux réellement réussis dans l'événement métier ;
- marque le résultat `completed`, `partial` ou `failed` ;
- finalise le workspace ;
- termine ou échoue le verrou parent ;
- supprime les événements techniques devenus inutiles.

Lorsque tous les canaux échouent, aucun événement métier Booster n'est validé et les compteurs ne doivent pas progresser.

## Points de durcissement identifiés

Ces points existaient avant l'audit et ne sont pas corrigés dans cette étape afin de respecter l'interdiction de modifier le comportement.

### Priorité haute — validation runtime des canaux

`body.channels` est converti en `ChannelKey[]` par assertion TypeScript, sans filtre runtime sur la liste autorisée. Un payload malformé peut donc atteindre la branche `unsupported_channel`.

Dans le parcours asynchrone, l'agrégateur final filtre ensuite les canaux inconnus. Cela peut rendre un job parent invalide ou non finalisable. La prochaine étape devrait filtrer ou refuser les canaux inconnus avant toute persistance et avant tout verrouillage.

### Priorité haute — verrou parent sur certains retours précoces

Le verrou parent est acquis avant trois validations simples :

- erreur de payload vidéo ;
- vidéo absente ;
- liste de canaux vide.

Ces réponses HTTP 400 ne libèrent pas explicitement le verrou. Il expire grâce au TTL, mais une relance avec la même clé peut être bloquée temporairement.

### Priorité haute — exception générale après acquisition du verrou

L'identifiant du verrou parent est déclaré à l'intérieur du bloc `try`. Le `catch` général ne peut donc pas systématiquement l'échouer lorsqu'une exception inattendue survient après son acquisition. Le TTL limite les conséquences, mais une fermeture explicite serait plus propre et plus sûre.

### Priorité moyenne — cohérence de `retryable`

Le résumé synchrone considère certains codes comme non retentables, notamment `bubble_access_disabled`. L'agrégateur asynchrone utilise une règle plus simple et ne partage pas cette liste. Selon le chemin d'exécution, une même erreur peut donc être proposée ou non à la relance.

### Priorité moyenne — branche canal non supporté

La branche finale produit `{ ok: false, error: "unsupported_channel" }` sans champ `code` et sans mise à jour immédiate de la livraison dans le fallback synchrone. Ce cas ne doit normalement jamais provenir de l'interface, mais il doit être rendu déterministe côté serveur.

## Recommandation avant refactorisation

Ne pas découper les 4 941 lignes immédiatement. Effectuer d'abord une étape 2 de durcissement minimal :

1. valider et dédupliquer les canaux avec une liste runtime partagée ;
2. déplacer les validations élémentaires avant le verrou parent ;
3. rendre le verrou parent accessible au `catch` général ;
4. partager la politique `retryable` entre les résumés synchrone et asynchrone ;
5. rendre `unsupported_channel` terminal et non retentable.

Cette étape doit rester petite, testée et sans toucher aux payloads médias ni aux implémentations propres aux réseaux.

## Validation de l'étape

- 15 nouveaux tests `publish-now` : réussis ;
- suite Dashboard : 62/62 ;
- sécurité de contenu Booster : 13/13 ;
- multi-compte : 54/54 ;
- iNr'Search : 19/19 ;
- Pinterest : 9/9 ;
- règles médias : 4/4 ;
- batterie globale exécutable : 662/662 ;
- 16 audits internes : réussis ;
- 1 256 fichiers TypeScript analysés : aucune erreur de syntaxe ;
- 3 667 imports internes contrôlés : aucun import cassé ;
- les neuf fichiers serveur critiques contrôlés conservent exactement leur hash initial.

Deux tests de la batterie complète ne démarrent pas dans cet environnement, car les dépendances `bmp-js` et `sharp` ne sont pas installées. Ils ne signalent pas une régression de cette étape.
