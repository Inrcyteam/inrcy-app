# Dashboard onboarding — verrous finaux et retour dashboard

## Corrections apportées

- E-réputation, iNrBadge et iNrSearch rejoignent les outils verrouillés tant que Mon profil et Mon activité sont incomplets.
- Les accès sont protégés à la fois dans l'interface, dans les paramètres d'URL et côté serveur pour E-réputation.
- Dans Tableau de bord, le cadenas COMS remplace la pastille décorative pendant le verrouillage.
- Dans les bulles iNrAgent, iNrSend, iNrBadge et iNrSearch, le cadenas remplace le point d'état.
- Dans Boîte de vitesse, les cadenas sont intégrés à gauche des titres, y compris E-réputation.
- L'écran « Préparation de votre configuration initiale » est réservé au parcours initial actif.
- Une fois le parcours passé ou terminé, l'état est mis en cache par établissement afin de revenir directement au dashboard dans le même navigateur.
- En cas de rechargement nécessitant une attente, le texte générique est « Chargement de votre dashboard iNrCy... ».
- Le départ OAuth Google Business d'E-réputation utilise un lien HTML classique afin d'éviter le préchargement Next.js et les erreurs CORS associées.

## Base de données

Aucune nouvelle migration SQL n'est requise. La migration onboarding de l'étape 2 reste la seule migration nécessaire.
