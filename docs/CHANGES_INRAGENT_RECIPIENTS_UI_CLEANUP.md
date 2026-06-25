# iNrAgent — nettoyage graphique destinataires mailing

## Objectif
Rendre la modification des destinataires Propulser/Fidéliser plus compacte, plus lisible et mieux adaptée aux campagnes mailing.

## Modifications réalisées

- Suppression du surtitre inutile `CRM iNrAgent` dans la modale de sélection des destinataires.
- Boutons de la barre de sélection rendus plus compacts et homogènes.
- Fusion des boutons `Tout` et `Aucun` en un seul bouton intelligent :
  - `Tout` sélectionne les contacts CRM filtrés.
  - `Aucun` désélectionne les contacts CRM filtrés quand ils sont déjà tous sélectionnés.
- Refonte du panneau de filtres pour éviter les chevauchements : catégorie, type, département et important uniquement restent alignés dans une zone dédiée.
- Simplification de l’affichage des contacts :
  - suppression des grosses bulles initiales ;
  - suppression des numéros de téléphone dans les lignes ;
  - suppression des badges lourds à droite ;
  - affichage en 2 lignes compactes : `Nom / RS — email`, puis `Type · Catégorie · Département`.
- Suppression du champ téléphone dans l’ajout rapide d’un contact depuis iNrAgent, car la modale concerne une campagne mailing.
- Réduction de la police et des hauteurs dans la modale pour gagner en lisibilité et afficher plus de contacts.
- Correction de l’affichage de la boîte d’envoi dans la carte iNrAgent : adresse mail en police plus petite, avec ellipsis pour ne plus sortir de la bulle.
- Renommage du bouton statistiques `Envoyer un bilan test` en `Envoyer un bilan`.

## Fichiers modifiés

- `app/dashboard/agent/AgentClient.tsx`
- `app/dashboard/agent/agent.module.css`

## SQL
Aucun SQL nécessaire.
