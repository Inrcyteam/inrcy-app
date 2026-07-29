# Synchronisation automatique Mon profil / Mon activité

Après chaque sauvegarde de **Mon profil** ou **Mon activité** :

- le dashboard recharge immédiatement les données utilisées par iNrBadge ;
- les routes publiques iNrSearch sont invalidées immédiatement ;
- le contexte professionnel de génération est invalidé en parallèle ;
- le même orchestrateur client est utilisé par les deux formulaires.

Le module historique `profileEvents.ts` et la route spécifique `/api/profile/public-assets` ont été supprimés au profit d’un flux partagé et générique.
La stabilisation de la barre de puissance reste inchangée et couverte par son test de non-régression.
