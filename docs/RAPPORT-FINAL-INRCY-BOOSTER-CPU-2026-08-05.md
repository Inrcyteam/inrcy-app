# Livraison finale — Booster iNrCy

Date : 5 août 2026

## Résultat

La version livrée remet Booster sur un flux unique et durable : génération images ou vidéo, vérification des contenus, attribution indépendante des médias par canal, publication parallèle, bilan rapide et poursuite des canaux encore en traitement dans iNrSend.

Le build de production, le typage global, ESLint et la matrice finale de 791 tests passent sans erreur. Aucun bloqueur connu ne reste dans les scénarios certifiés.

## Cause de l'emballement Supabase

Le basculement correspond au refactor massif `90e1ac7` du 3 août 2026 à 00:08. Il a créé une chaîne d'amplification, pas un simple problème de puissance serveur :

- vérifications TikTok réécrites dans `app_events` et `publication_deliveries` même sans changement réel ;
- crons média relisant chaque minute des originaux `source_only/not_requested` sans travail à effectuer ;
- crons Booster relisant des payloads JSON complets avant de savoir si le job devait être traité ;
- métriques Booster parcourant aussi des événements techniques volumineux ;
- pollings doublonnés ou encore actifs lorsque l'onglet était masqué ;
- statut iNrSearch chargeant une page publique complète, des événements et des signatures Storage pour afficher un simple voyant ;
- écritures et rafraîchissements redondants du workspace média.

Les statistiques de production confirmaient cette boucle : environ 2 633 mises à jour de `app_events` et 2 578 de `publication_deliveries`, soit la signature d'un même suivi réécrivant les deux tables.

## Corrections structurelles

- Un statut TikTok inchangé effectue désormais zéro `UPDATE`, zéro finalizer et aucune relecture de livraison supplémentaire. Seules une progression, une erreur, un blocage, une annulation ou une transition terminale sont persistés.
- Les réparateurs image et vidéo ne sélectionnent plus les originaux sans préparation demandée. Leurs requêtes sont séparées, bornées, indexables et équitables entre reprises.
- Les deux crons média de secours passent de chaque minute à toutes les cinq minutes et sont décalés l'un de l'autre. Le traitement normal reste immédiat ; ces crons ne sont plus qu'un filet de reprise.
- Le cron Booster charge d'abord des projections compactes et bornées, puis le payload complet uniquement par clé primaire pour le petit lot choisi.
- Les métriques Booster excluent les événements techniques async et utilisent un index partiel dédié.
- Les abonnements Realtime sont filtrés par compte, non dupliqués et démontés quand l'onglet est masqué.
- Le compteur iNrAgent est partagé entre les navigations desktop/mobile : une seule requête, un seul intervalle, cache isolé par compte.
- Les suivis de publication, iNrSend, notifications, iNrSearch et statistiques cessent leurs requêtes lorsque l'onglet est masqué et reprennent une seule fois au retour.
- Le statut iNrSearch est maintenant minimal et ne charge plus la page publique, les événements Booster ou Storage.
- Les appels workspace sont bornés, annulables et idempotents ; les mises à jour identiques deviennent de vrais no-op.

## Booster certifié

- Génération IA avec images.
- Génération IA avec vidéo jusqu'à 300 Mo en source.
- Mode manuel.
- Publication images seules.
- Publication vidéo seule.
- Publication mixte par canal : par exemple Site/Facebook/Instagram en images et TikTok/YouTube en vidéo.
- Lot partagé de cinq images maximum avec sélection et ordre indépendants par canal.
- Une vidéo source unique réutilisable sur les canaux choisis.
- Original compatible envoyé tel quel ; adaptation uniquement lorsque le canal l'exige.
- Échec isolé : un canal en erreur ne bloque jamais les autres.
- YouTube avec vidéo privée issue du workspace, y compris lorsque les autres canaux utilisent des images.
- Reprise TikTok par plages, Instagram par phases durables et Pinterest avec le bucket privé réel.
- Brouillons, programmation, iNrSend et traitements de fond conservant workspace, choix par canal et statuts.
- Barre globale de publication sans bande horizontale détaillée par canal.

## Validation finale

- TypeScript global : réussi.
- ESLint global : réussi.
- Build Next.js 16 de production : réussi.
- Matrice finale : 791/791 tests réussis, 0 échec.
- Dashboard : 213/213 tests réussis dans sa passe complète.
- TikTok : 33/33 tests réussis dans sa passe complète.
- Publication/iNrSend et suivi durable : 299/299 tests réussis dans la passe élargie.
- Index SQL requis : les huit index de publication précédents et le nouvel index de reprise média ont été vérifiés valides en production.

Les comptes fournisseurs et leurs délais restent externes à iNrCy. Si un canal ne termine pas dans la fenêtre visible, son état reste durable dans iNrSend et le traitement continue côté serveur sans retenir les autres canaux.

## Déploiement

1. Extraire le ZIP Windows livré.
2. Déployer son contenu sur le dépôt utilisé par Vercel en conservant les variables d'environnement de production.
3. Laisser Vercel exécuter l'installation et le build habituels.
4. Aucun SQL supplémentaire n'est à lancer : le dernier index a déjà été appliqué et vérifié en production.
5. Après déploiement, faire un smoke test avec le compte de test : génération images, génération vidéo, publication images, publication vidéo, publication mixte, puis contrôle du bilan dans iNrSend.

Le ZIP ne contient ni `node_modules`, ni `.next`, ni rapport Playwright, ni fichier `.env`, ni secret. Il est prévu pour une extraction Windows courte et un build propre sur Vercel.
