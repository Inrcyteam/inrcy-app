# Correctifs iNrAgent — workspace de validation des campagnes

## Objectif

Transformer iNrAgent en véritable espace de validation/modification des campagnes automatiques, sans renvoyer l'utilisateur vers iNrCRM ou iNrSend pour les actions de correction.

## Modifications principales

### Interface iNrAgent

- Ajout d'une action “œil” sur la carte Destinataires lorsque la campagne contient des destinataires.
- Ajout d'une modale interne de consultation des destinataires prévus.
- Ajout d'une modale interne de modification des destinataires :
  - recherche dans les contacts CRM ;
  - sélection/désélection par cases à cocher ;
  - ajout rapide d'un nouveau contact depuis iNrAgent ;
  - sauvegarde dans l'action iNrAgent préparée.
- Remplacement de l'ancienne redirection CRM depuis “Modifier la campagne”.
- Ajout d'une modale interne pour modifier la boîte d'envoi, avec choix parmi les boîtes mail connectées.
- Remplacement de l'ancienne redirection iNrSend pour la boîte d'envoi.
- Ajout d'une vraie modale de pièces jointes :
  - upload dans le bucket `inrbox_attachments` ;
  - affichage des fichiers liés à la campagne ;
  - suppression/remplacement par ajout/suppression ;
  - persistance dans l'action iNrAgent.
- En responsive, le badge “à valider” reste sur la bulle de l'action, pas sur l'icône de réglage.

### API iNrAgent

- Ajout de la modification des destinataires d'une action préparée.
- Ajout de la modification de la boîte d'envoi d'une action préparée.
- Ajout de la modification des pièces jointes d'une action préparée.
- Les pièces jointes préparées par iNrAgent sont maintenant transmises à la campagne exécutée.

### Qualité des campagnes automatiques IA

- Les campagnes automatiques iNrAgent sont maintenant générées avec une consigne explicite : prêt à valider, jamais prêt à compléter.
- Interdiction des placeholders et morceaux de modèle dans les emails générés :
  - crochets `[à compléter]` ;
  - variables `{{...}}` ;
  - libellés de travail comme “Exemple local”, “Secteur :”, “Besoin :”, “Résultat :”.
- Nettoyage du markdown gras `**...**` dans les campagnes IA.
- Si la génération contient encore un morceau incomplet, une deuxième génération est automatiquement tentée.
- Si le contenu reste incomplet après retry, la préparation est bloquée avec une erreur claire au lieu d'afficher un brouillon non fini au professionnel.

## Fichiers modifiés

- `app/dashboard/agent/AgentClient.tsx`
- `app/dashboard/agent/agent.module.css`
- `app/api/agent/actions/route.ts`
- `app/api/agent/actions/execute/route.ts`
- `app/api/agent/actions/prepare-campaign/route.ts`
- `lib/templateAiGeneration.ts`

## SQL

Aucune migration SQL nécessaire.
