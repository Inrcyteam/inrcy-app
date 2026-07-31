# iNrSend — historique en lecture seule, origine iNrAgent et navigation

Date : 31 juillet 2026

## Périmètre

- Suppression de toute suppression manuelle de l'historique iNrSend dans l'interface.
- Refus serveur systématique de l'ancienne route de suppression manuelle.
- Conservation du nettoyage automatique existant, sans archive supplémentaire.
- Affichage d'un repère robot pour les publications et campagnes dont l'origine est `inr_agent`.
- Persistance contrôlée de l'événement iNrSend après une publication iNrAgent.
- Réconciliation des publications asynchrones et fallback strict pour les actions iNrAgent dont la persistance a explicitement échoué.
- Navigation précédent / suivant dans le détail, y compris entre deux pages de résultats.
- Confirmation avant navigation ou fermeture lorsqu'une modification de publication n'est pas enregistrée.
- Mise à jour du helper : les demandes exceptionnelles de suppression doivent être adressées à `contact@inrcy.com`.

## Garde-fous

- Aucune republication n'est déclenchée par la réconciliation.
- Les fallback iNrAgent ne sont créés que si `historyPersisted === false`, afin de ne pas faire réapparaître d'anciens tests volontairement supprimés.
- La déduplication privilégie l'événement canonique `app_events` lorsqu'il existe.
- La suppression métier d'une publication sur un canal reste distincte de l'historique iNrSend.
- Les durées de rétention automatique ne sont pas modifiées.

## Validation

- TypeScript : validé.
- ESLint ciblé sur les fichiers modifiés : validé.
- Tests iNrSend : 45/45.
- Tests dashboard : 88/88.
- Tests multicompte : 54/54.
- QA iNrSearch : 106/106 et tests iNrSearch : 23/23.
- Règles médias : 4/4 ; consommation unifiée : 3/3 + 9/9.
