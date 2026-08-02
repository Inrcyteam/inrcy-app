# Audit comparatif du système de publication iNrCy

Date : 2 août 2026  
Périmètre : `controle.zip`, ZIP « réaudit complet hotfix final », captures fournies, publication immédiate, publication asynchrone, médias, résultats et actions iNrSend.

## Verdict

Le ZIP réaudité n'était pas à jeter. Il contient de vraies améliorations d'architecture et il doit rester la base. En revanche, il combinait :

- un défaut historique majeur déjà présent dans `controle.zip` : une validation média d'un seul canal pouvait interrompre toute la publication avant le dispatch ;
- deux régressions introduites ou aggravées par le réaudit : la fausse détection « TikTok en traitement » à partir d'un champ `status` générique, et une régénération FFmpeg synchrone dans la requête de publication ;
- plusieurs défauts d'état : « Retirer du canal » ne retirait pas réellement le canal, une liste explicite vide pouvait restaurer les anciens canaux, et les maps média pouvaient encore transporter TikTok après sa désélection ;
- des tests trop couplés au texte du code, dont un verrouillait l'empreinte exacte d'une boucle de 61 547 caractères au lieu de vérifier son comportement.

Le correctif conserve les bonnes fondations, rétablit l'indépendance des canaux et rend le bilan fidèle aux résultats réels.

## Reconstitution exacte de l'incident

1. La vidéo dure 10 min 36 s et Site web, iNr'Search et TikTok sont sélectionnés.
2. La route `publish-now` constate que TikTok dépasse la limite codée en dur de 10 min et renvoie `422 video_variant_required`.
3. Cette réponse est produite avant la persistance et le fan-out par canal. Site web et iNr'Search ne sont donc jamais dispatchés, alors qu'ils sont valides.
4. « Retirer du canal » changeait seulement le mode média, pas la sélection. D'autres résolveurs et maps pouvaient réintroduire TikTok dans le payload.
5. Même lorsque le second essai ne renvoyait plus que Site web et iNr'Search, le nouveau classificateur lisait `result.status`. iNr'Search renvoie normalement `status: "published"`. Comme `PUBLISHED` n'était pas un statut terminal TikTok connu, le résultat iNr'Search était faussement classé « processing ».
6. La modale affichait alors un texte TikTok codé en dur pour n'importe quel résultat en traitement. C'est la raison précise pour laquelle le bilan parle de TikTok après son retrait.

## Comparaison des deux ZIP

Hors dépendances et artefacts de build :

- passage de `controle.zip` au réaudit : 38 fichiers ajoutés, 62 modifiés, aucun supprimé ;
- correctif final : 4 fichiers fonctionnels ajoutés, 31 fichiers modifiés ;
- aucun retour global vers l'ancienne architecture.

### Modifications du réaudit réellement utiles et conservées

- séparation de `publish-now` en fondations, préparation serveur et contexte par canal ;
- publication asynchrone par canal avec événements techniques, livraisons durables, verrous d'idempotence, statut agrégé et reprise cron ;
- workspace média strict, préparation serveur, préchauffage et variantes persistées ;
- validation et traitement spécifiques à Google Business ;
- distinction entre succès, avertissement média, traitement asynchrone et échec ;
- renforcement des règles images/vidéos, de l'observabilité et de la couverture de tests ;
- centralisation de plusieurs politiques Meta et métriques.

Ces changements améliorent réellement la maintenabilité, la reprise et la scalabilité. Le problème venait de quelques décisions transversales qui annulaient une partie de leurs bénéfices.

### Modifications inutiles ou dangereuses corrigées

- validation globale avant fan-out : incompatible avec l'indépendance attendue des canaux ;
- régénération de variantes vidéo dans la requête `publish-now` : risque de dépasser les 180 s et de faire rejouer une publication ;
- interprétation de tout champ `status` comme un statut TikTok ;
- texte TikTok générique dans la modale ;
- fallback Facebook/LinkedIn vers un post texte après une réponse réseau ambiguë : risque de doublon si le fournisseur avait accepté la première requête ;
- suppression de l'ancien post iNrSend avant confirmation du nouveau : fenêtre de perte ;
- signature de variante vidéo sans politique de fond : résultat dépendant de l'ordre des canaux ;
- réinjection d'images volontairement désélectionnées lors d'une synchronisation de métadonnées ;
- tests d'empreinte exacte et tests exigeant l'ancien comportement dangereux.

## Correctifs livrés

### 1. Indépendance réelle des canaux

- Chaque erreur de prévalidation est maintenant attachée au canal concerné.
- Les canaux valides sont persistés et dispatchés même si TikTok, Pinterest ou un autre canal est invalide.
- Les livraisons invalides sont immédiatement terminalisées en `failed`; les autres restent `queued` puis partent normalement.
- Un lot entièrement invalide se finalise proprement sans rester bloqué.
- Le chemin synchrone suit la même règle et continue après l'échec d'un canal.
- Les canaux ignorés sont conservés dans le bilan au lieu de disparaître.

### 2. TikTok et état de la modale

- La limite générique fixe de 10 min est supprimée.
- La durée autorisée provient de `creator_info.max_video_post_duration_sec`, donc du compte TikTok réellement connecté.
- La validation TikTok reste faite au plus près de l'envoi, avec les informations fraîches du créateur.
- Un bouton permet de retirer TikTok et de continuer sur les autres canaux lorsqu'il constitue le seul bloqueur.
- « Retirer du canal » désélectionne désormais réellement le canal et nettoie ses réglages TikTok.
- Une liste `channels: []` explicite n'est plus remplacée par l'ancienne sélection.
- Toutes les maps par canal sont filtrées avant envoi.
- Seuls `tiktok_status` et `tiktokStatus` sont interprétés comme statuts TikTok ; le champ générique `status` ne l'est plus.
- La modale cite uniquement les canaux réellement en traitement et affiche les canaux échoués ou ignorés avec leur motif.
- Les erreurs HTTP structurées (`code`, `invalidChannels`, payload complet) sont préservées côté client.

TikTok demande officiellement d'interroger les informations du créateur puis de respecter `max_video_post_duration_sec`, plutôt que d'imposer une constante universelle : [référence Direct Post](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post?enter_method=left_navigation) et [guide Content Posting](https://developers.tiktok.com/doc/content-posting-api-get-started//).

### 3. Médias, performances et déterminisme

- `publish-now` ne lance plus de transcodage FFmpeg synchrone. Il utilise une variante préparée ou la source si elle respecte la politique du canal ; la génération lourde reste dans le préchauffage/pipeline dédié.
- La signature vidéo contient désormais le profil de fond. Un rendu clair ou sombre ne dépend plus de l'ordre de sélection des canaux.
- Google Business conserve sa variante dédiée et sa validation stricte sans contaminer la variante sociale partagée.
- Le probe Google Business est borné à 3 s, un essai par défaut, deux au maximum.
- Le choix PNG/JPEG utilise l'alpha réellement détecté par Sharp : un PNG opaque ne reste plus inutilement lossless.
- Une désélection d'image reste respectée ; seules les nouvelles images authentiques sont auto-ajoutées.

### 4. Fiabilité et prévention des doublons

- Facebook et LinkedIn ne basculent vers le texte que sur un rejet explicite où l'on sait que le média n'a pas été publié.
- Un timeout, une erreur 5xx ou une réponse 2xx sans identifiant devient `provider_status_unknown` et n'entraîne pas une seconde publication potentiellement dupliquée.
- Lors d'une modification iNrSend, le nouveau post est créé avant le nettoyage de l'ancien.
- Les avertissements ne sont plus enregistrés dans le champ `error`.
- La reprise asynchrone est plafonnée à trois tentatives ; au-delà, événement et livraison sont terminalisés avec `async_dispatch_exhausted` et le parent est finalisé.

## Certification exécutée

- 85 fichiers de tests ciblant publication, dashboard, iNrSend, décisions images, règles médias et pipeline ;
- 436 assertions réussies, 0 échec ;
- 19 scripts d'audit internes réussis sur 19 ;
- `npm run lint` : réussi ;
- `npm run typecheck` : réussi ;
- `npm run build` Next.js 16.2.11 : réussi, compilation, TypeScript et génération de 213 pages/routes ;
- `npm audit --omit=dev --audit-level=high` : 0 vulnérabilité connue sur les dépendances de production ;
- recherche de secrets usuels : aucun secret embarqué dans le livrable ;
- ZIP sans `node_modules`, `.next`, `.git`, fichier `.env` ni cache TypeScript.

Les variables factices utilisées pour certifier le build n'ont existé qu'en mémoire du processus et ne sont écrites dans aucun fichier.

## Limite honnête de la certification

Le code livré est certifié statiquement et par tests locaux, mais il n'a pas été déployé à ta place et aucun post réel n'a été envoyé avec tes jetons de production. Un « 20/20 production » ne peut être affirmé sérieusement qu'après un smoke test sur un Preview Vercel connecté à un projet Supabase de test. Les services ouverts dans le navigateur n'ont donc pas été modifiés.

## Procédure de mise en ligne recommandée

1. Conserver le déploiement actuel comme rollback.
2. Décompresser le ZIP dans une branche dédiée et conserver les variables d'environnement Vercel existantes.
3. Exécuter `npm ci`, `npm run lint`, `npm run typecheck`, puis `npm run build`.
4. Déployer d'abord en Preview Vercel.
5. Exécuter la matrice de recette ci-dessous avant promotion en production.

Aucune nouvelle migration SQL n'est requise par ce correctif.

## Matrice de recette indispensable

| Cas | Résultat attendu |
|---|---|
| Vidéo 10 min 36, Site web + iNr'Search + TikTok, compte TikTok limité sous 10 min 36 | Site web et iNr'Search partent ; TikTok seul échoue avec sa limite réelle ; bilan partiel fidèle |
| Même vidéo après « Retirer TikTok » | aucun payload, résultat ni texte TikTok ; les autres canaux partent |
| TikTok seul, vidéo trop longue | échec TikTok explicite sans publication fantôme |
| iNr'Search renvoie `status: published` | affiché « Publié », jamais « TikTok en traitement » |
| Facebook/LinkedIn timeout après upload | aucun fallback texte automatique et aucun doublon |
| Image retirée puis métadonnées resynchronisées | l'image reste retirée |
| Ajout d'une nouvelle image après désélection | seule la nouvelle image est ajoutée automatiquement |
| Google Business avec vidéo incompatible | seul GMB échoue ou omet le média selon sa politique ; les autres canaux continuent |
| Reprise async trois fois en échec | livraison terminale, parent finalisé, aucun replay infini |

## Conclusion

La catastrophe observée avait une cause déterministe, pas un comportement aléatoire. L'architecture réauditée était globalement meilleure, mais l'isolation était placée trop tard et l'UI mélangeait les statuts de tous les fournisseurs avec TikTok. Le livrable corrige ces deux axes sans sacrifier les améliorations de scalabilité.
