# Allègement — Étape 6 — Audit `AgentClient.tsx`

Date : 31 juillet 2026

## Objet

Auditer le plus gros composant TypeScript restant après les audits Dashboard, MailboxDetails et PublishModal Shared, sans déplacer, supprimer ou modifier une ligne de code applicatif.

## Périmètre

Fichier audité :

`app/dashboard/agent/AgentClient.tsx`

## Mesures

- 6 460 lignes.
- Le composant React commence à la ligne 317.
- 42 modules importés, dont 17 modules internes au dossier `agent`.
- 39 états React (`useState`).
- 4 effets (`useEffect`).
- 16 calculs mémorisés (`useMemo`).
- Environ 77 gestionnaires ou fonctions locales dans le composant.
- 19 appels `fetch`.
- Environ 2 958 lignes de rendu JSX à partir du `return` principal.
- 3 fichiers de tests lisent directement `AgentClient.tsx` comme texte source.

## Modularisation déjà présente

Le fichier est déjà entouré de modules spécialisés :

- 5 hooks : données runtime, responsive, éditeurs riches, automatisations et exécution des actions ;
- 4 fichiers de composants : modales, éditeurs de campagne, retours utilisateur et éléments visuels ;
- 8 bibliothèques internes : types, configuration, utilitaires, paramètres, aperçu publication, aperçu campagne, rapports et programmation.

Cette organisation montre qu’une première séparation structurelle importante a déjà été réalisée. Le volume restant n’est pas constitué d’un bloc facilement détachable, mais principalement de l’orchestration centrale de l’interface.

## Responsabilités encore regroupées dans le composant

1. Sélection et aperçu des canaux.
2. Édition des textes de publication et de campagne.
3. Validation, lecture, ajout, remplacement et suppression des médias.
4. Adaptation des images par canal et gestion des transformations.
5. Préparation et adaptation des vidéos.
6. Gestion des destinataires CRM.
7. Choix des comptes mail et des pièces jointes.
8. Sauvegarde des brouillons.
9. Modification, création, suppression et annulation des programmations.
10. Validation ou refus des actions préparées.
11. Paramétrage des automatisations.
12. Rendu des panneaux, modales et états de progression.

## Petites fonctions situées avant le composant

Trois fonctions seulement apparaissent après les imports et avant le composant :

- conversion d’une URL de données en `File` ;
- conversion d’une position de dessin en décalage ;
- téléchargement d’une URL vers un `File`.

Leur extraction retirerait peu de lignes, modifierait les imports et toucherait aux contrats navigateur/média. Le bénéfice ne justifie pas ce risque dans une série annoncée comme strictement sans risque.

## Verrous de sécurité constatés

Des tests lisent directement le texte de `AgentClient.tsx` pour contrôler notamment :

- l’ajout d’images programmées sans remplacement involontaire ;
- la règle de 5 images maximum ou 1 vidéo ;
- la suppression et le remplacement des médias ;
- la conservation des contrats multicompte ;
- l’import obligatoire des règles médias centralisées.

D’autres tests couvrent indirectement ses interactions avec le pipeline vidéo, Pinterest, iNrSearch, iNrSend, l’AI Gateway et les verrous d’onboarding.

## Décision

Aucune extraction n’est réalisée dans la série « strictement sans risque ».

La partie restante du composant est très stateful et fortement connectée aux appels réseau, aux modales et aux contrats médias. Un découpage ultérieur nécessiterait un chantier de refactorisation contrôlé, des adaptations de tests et une validation CI complète. Il pourrait être mené à faible risque, mais pas à risque nul.

## Certification exécutée

- 104 tests ciblés réussis sur 104.
- 12 audits transverses réussis sur 12.
- Aucun fichier applicatif modifié.
- Aucun import modifié.
- Aucun asset supprimé.
- Seul ce rapport d’audit a été ajouté.

## Conclusion

`AgentClient.tsx` reste volumineux, mais il est déjà largement modularisé. Le volume résiduel correspond au contrôleur central de l’expérience iNrAgent. Dans le cadre strict « sans risque », le choix correct est de le conserver intact.
