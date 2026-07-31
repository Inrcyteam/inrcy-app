# Allègement structurel — Étapes 15 et 16

Date : 31 juillet 2026

## Objectif

Réduire deux contrôleurs clients encore très volumineux en déplaçant uniquement des helpers purs et autonomes. Aucun hook React, état, JSX, appel réseau, accès Supabase ou action utilisateur n'a été déplacé.

## Étape 15 — Fondations média de publication iNrAgent

Fichier allégé : `app/dashboard/agent/AgentClient.tsx`

- Avant : 6 409 lignes.
- Après : 6 310 lignes.
- Réduction du composant : 99 lignes.
- Nouveau module : `app/dashboard/agent/_lib/agent.publish-media-foundations.ts`.

Fonctions déplacées sans réécriture métier :

- lecture des dimensions d'une image ;
- lecture des dimensions et de la durée d'une vidéo ;
- lecture unifiée des métadonnées d'un média ;
- lecture sûre d'une réponse API JSON ou texte ;
- construction du patch de compatibilité d'un média provenant de la Médiathèque.

La validation des fichiers, les états d'upload, les appels API, les sauvegardes et les notifications restent dans `AgentClient.tsx`.

## Étape 16 — Fondations de composition et reprise de campagnes iNrSend

Fichier allégé : `app/dashboard/mails/MailboxClient.tsx`

- Avant : 5 022 lignes.
- Après : 4 797 lignes.
- Réduction du composant : 225 lignes.
- Nouveau module : `app/dashboard/mails/_lib/mailboxComposeCampaign.foundations.ts`.

Éléments déplacés sans réécriture métier :

- type d'intention de suivi des campagnes ;
- sérialisation des pièces jointes ;
- normalisation des départements CRM ;
- conversion sûre d'une valeur en objet de programmation ;
- détection du suivi d'une ancienne campagne ;
- normalisation des pièces jointes de campagne ;
- détermination de la destination de reprise Propulser ou Fidéliser.

Les cinq appels qui utilisaient implicitement l'état `composeAttachments` le reçoivent désormais explicitement. Le corps de sérialisation reste identique. Les états React, sauvegardes, programmations, envois, appels API et ouvertures de modales restent dans `MailboxClient.tsx`.

## Résultat

- 324 lignes retirées des deux contrôleurs centraux.
- 12 fonctions déplacées avec corps strictement identique à l'original.
- Aucun fichier supprimé.
- Aucun CSS, SQL, asset, route API ou composant visuel modifié.

## Certification locale

- 702/702 tests Node exécutables réussis.
- 49/49 tests iNrAgent et iNrSend réussis.
- 7 nouveaux tests de frontière et de comportement réussis.
- 12/12 audits transverses réussis : multicompte, AI Gateway et pipeline média étapes 1 à 10.
- 38/38 contrôles Pinterest Standard réussis.
- 9/9 tests Pinterest réussis.
- Comparaison automatique des 12 corps de fonctions : identiques.
- Les 5 appels reposant auparavant sur le paramètre par défaut `composeAttachments` sont préservés explicitement.
- Tous les imports relatifs des fichiers touchés se résolvent.
- Aucun cycle direct entre les nouveaux modules et leurs composants d'origine.

Deux fichiers de tests binaires ne peuvent pas démarrer localement sans `bmp-js` et `sharp`, absents de l'archive. Le lint, le typecheck et le build complets restent à confirmer dans la CI avec les dépendances installées.

## Niveau de risque

Risque très faible et contrôlé, mais non nul au sens absolu puisqu'il s'agit d'un déplacement de code et de nouveaux imports.
