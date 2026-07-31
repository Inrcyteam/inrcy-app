# Dashboard — ouverture instantanée, cache et navigation (31 juillet 2026)

## Correctifs

- Les clics du dashboard ne sont plus ignorés pendant la vérification réseau Profil / Activité. Un état incomplet déjà confirmé conserve les protections d'onboarding.
- Toutes les routes principales du dashboard sont préchargées dès l'ouverture du layout.
- Les instantanés CRM, iNrSend, iNrCalendar, Propulser et Fidéliser sont conservés par établissement dans le stockage navigateur. Ils sont affichés immédiatement, puis actualisés silencieusement.
- iNrCRM permet de passer au contact précédent ou suivant, y compris entre deux pages.
- iNrCalendar permet de passer à l'évènement précédent ou suivant.
- Propulser et Fidéliser permettent de passer entre leurs trois thèmes, avec confirmation avant d'abandonner des changements.
- Les commandes précédent / suivant restent visibles sur mobile.
- L'ancien composant modal dupliqué de Fidéliser a été supprimé au profit du composant commun.
- Le nettoyage pré-build Windows retente plus longtemps la suppression de `.next` en cas de verrouillage transitoire.

## Comportement du cache

Le cache est un accélérateur UX, jamais une source d'autorité. Les données mémorisées s'affichent immédiatement et une requête réseau silencieuse les remplace dès qu'elle aboutit. Les clés sont isolées par établissement actif et purgées lors du nettoyage des caches de compte.

Un tout premier accès sur un navigateur sans aucun instantané nécessite toujours une première réponse réseau. Le préchauffage lancé depuis le dashboard réduit ce cas avant le premier clic.

## Contrôles réalisés

- TypeScript : réussi.
- ESLint ciblé sur tous les fichiers modifiés : réussi.
- Tests dashboard : 92/92.
- Tests iNrSend : 46/46.
- Tests onboarding : 36/36.
- Tests multicompte : 54/54.
- Build Next : non certifié dans le conteneur, car le registre interne ne fournit pas le binaire Linux SWC de Next 16.2.11 (HTTP 404).
