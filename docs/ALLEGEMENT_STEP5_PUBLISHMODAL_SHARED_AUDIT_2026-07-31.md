# Allègement — Étape 5 — Audit `publishModal.shared.tsx`

Date : 31 juillet 2026

## Objet

Auditer le gros fichier partagé de Booster sans déplacer, supprimer ou modifier une ligne de code applicatif.

## Périmètre

Fichier audité :

`app/dashboard/booster/publier/publishModal.shared.tsx`

## Mesures

- 2 499 lignes.
- 131 déclarations exportées : types, constantes et fonctions.
- 24 fichiers applicatifs importent directement ce module.
- 11 fichiers de tests lisent directement le texte source du fichier.
- 96 références à des API ou types navigateur ont été relevées.
- 7 références directes aux mécanismes réseau ou d’upload ont été relevées.

## Domaines actuellement regroupés

1. Types communs, langues et préférences CTA.
2. Ordre, libellés et presets des canaux.
3. Règles et limites images/vidéos.
4. Validation des exigences de publication par canal.
5. Textes, hashtags, CTA et préremplissage.
6. Préparation des images pour l’IA.
7. Chargement vidéo et captures de frames pour l’IA.
8. Calculs de cadrage, transformations et rendu Canvas.
9. Nommage et chemins de stockage.
10. Upload vidéo et upload universel de secours.
11. Compression, upload et préparation des images.
12. Rendu final par canal et synchronisation des éditeurs.

## Verrous de sécurité constatés

Le fichier est un contrat partagé entre Booster, iNrAgent, iNrSend, les composants de programmation, les paramètres IA et les contrôleurs médias.

Plusieurs tests vérifient directement dans ce fichier :

- les limites centralisées de 5 images ou 1 vidéo ;
- le maintien de l’upload universel et de ses fallbacks ;
- la préparation persistante du workspace ;
- Google Business jusqu’à 5 images ;
- Pinterest jusqu’à 5 images ;
- la limite de contenu iNrSearch ;
- l’absence de conversion HEIC/HEIF via une route Vercel ;
- les contrats critiques du pipeline média.

Une extraction modifierait au minimum les imports et la localisation textuelle de ces contrats. Elle pourrait donc casser les tests de certification même avec un runtime théoriquement identique.

## Décision

Aucune extraction n’est réalisée dans la série « strictement sans risque ».

Le fichier peut être découpé plus tard dans un chantier de refactorisation contrôlé, avec adaptation explicite des tests et validation CI complète. Cette opération serait à faible risque, mais pas à risque nul.

## Certification exécutée

- 67 tests ciblés réussis sur 67.
- 12 audits transverses réussis sur 12.
- Aucun fichier existant modifié.
- Aucun import modifié.
- Aucun asset supprimé.
- Seul ce rapport d’audit a été ajouté.

## Conclusion

Le module est volumineux, mais il est aujourd’hui trop central et trop contractuel pour être déplacé dans une étape annoncée comme sans risque. Le choix le plus sûr est de le conserver intact.
