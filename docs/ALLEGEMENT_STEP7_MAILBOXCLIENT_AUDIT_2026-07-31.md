# Allègement — Étape 7 — Audit `MailboxClient.tsx`

Date : 31 juillet 2026

## Objet

Auditer le contrôleur principal iNrSend sans déplacer, supprimer ou modifier une ligne de code applicatif.

## Périmètre

Fichier audité :

`app/dashboard/mails/MailboxClient.tsx`

## Mesures

- 5 148 lignes.
- Le composant React commence à la ligne 302.
- 29 déclarations d’import.
- 14 imports locaux au module Mails ou à ses voisins directs.
- 41 états React (`useState`).
- 29 effets (`useEffect`).
- 26 calculs mémorisés (`useMemo`).
- 4 callbacks mémorisés (`useCallback`).
- Environ 78 fonctions ou gestionnaires nommés dans le fichier.
- 19 appels `fetch`.
- 22 références au client ou aux chaînes Supabase.
- 8 tests ou scripts lisent directement `MailboxClient.tsx` comme texte source.

## Modularisation déjà présente

Le contrôleur s’appuie déjà sur dix composants spécialisés :

- en-tête de la boîte mail ;
- menu mobile des dossiers ;
- onglets des dossiers ;
- barre d’outils ;
- liste des éléments ;
- panneau de recherche ;
- modale de détails ;
- modale d’adaptation des images de publication ;
- modale de composition ;
- tiroir de configuration IA partagé avec Booster.

Il utilise également deux bibliothèques locales importantes :

- `mailboxPhase1.tsx`, qui centralise types, règles, formats, statuts et rendu de plusieurs données ;
- `mailboxPhase25.ts`, qui centralise les identifiants d’inputs, chemins de pièces jointes, normalisation des destinataires et endpoints d’envoi.

Le fichier est donc déjà découpé sur ses composants visuels et une partie significative de ses règles pures.

## Responsabilités encore regroupées dans le contrôleur

1. Chargement des comptes mail et de la signature.
2. Navigation entre dossiers, recherche, pagination et sélection multiple.
3. Chargement et suppression des historiques, brouillons et programmations.
4. Composition et sauvegarde des emails.
5. Préparation des campagnes et de leurs destinataires CRM.
6. Envoi immédiat, programmation et nouvelle tentative.
7. Édition des publications multicanales depuis iNrSend.
8. Ajout, remplacement, réorganisation et suppression des images.
9. Ajout, upload, préparation et adaptation des vidéos.
10. Gestion Google Business jusqu’à cinq images.
11. Gestion multicompte et résolution de l’utilisateur actif.
12. Polling, rapports de campagne et reprises après erreur.

## Fonctions placées avant le composant

Trois fonctions seulement sont placées avant le composant :

- normalisation d’une clé de canal pour la vidéo ;
- conversion d’une pièce jointe en payload vidéo ;
- lecture navigateur des métadonnées vidéo.

Leur extraction retirerait peu de lignes et modifierait les imports. La troisième fonction dépend directement de `document`, `window`, d’un élément vidéo et d’un délai de secours. Le bénéfice ne justifie pas cette modification dans une série annoncée comme strictement sans risque.

## Verrous de sécurité constatés

Huit tests ou scripts lisent directement le texte du fichier pour vérifier notamment :

- les verrous de scope multicompte ;
- l’utilisation de `resolveActiveBrowserUserId` ;
- les règles médias centralisées ;
- Google Business avec plusieurs images ;
- l’intégration des images entre Booster, iNrAgent et iNrSend ;
- la normalisation vidéo ;
- les rapports professionnels des campagnes.

Une extraction pourrait donc casser la certification textuelle même avec un runtime théoriquement identique.

## Décision

Aucune extraction n’est réalisée dans la série « strictement sans risque ».

Le volume restant correspond au contrôleur central d’iNrSend et relie états React, Supabase, appels API, campagnes, brouillons, médias et composants. Un futur découpage serait possible dans un chantier de refactorisation contrôlé, mais pas à risque nul.

## Certification exécutée

- 105 tests ciblés réussis sur 105 : 85 tests TypeScript iNrSend/multicompte et 20 tests JavaScript médias/intégration.
- 12 audits transverses réussis sur 12.
- Aucun fichier applicatif modifié.
- Aucun import modifié.
- Aucun asset supprimé.
- Seul ce rapport d’audit a été ajouté pour l’étape 7.

## Conclusion

`MailboxClient.tsx` reste volumineux, mais ses frontières visuelles et une grande partie de ses règles sont déjà externalisées. Le cœur restant est trop connecté pour être déplacé dans une opération strictement sans risque.
