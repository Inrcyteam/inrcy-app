# Correctif boucle de connexion après onboarding plein écran

## Symptôme

Après authentification, `/login` restait sur « Connexion en cours… » et pouvait alterner silencieusement avec `/dashboard`.

## Cause

Le premier chargement du dashboard lançait un préchargement serveur supplémentaire de l’état d’onboarding, en parallèle des contrôles d’authentification déjà exécutés par le layout. En même temps, l’écouteur `onAuthStateChange` pouvait déclencher une navigation avant que la session SSR soit totalement relue.

## Correctif

- suppression du préchargement serveur supplémentaire dans `app/dashboard/page.tsx`;
- conservation de l’écran de démarrage côté client tant que l’état d’onboarding n’est pas prêt, donc aucun flash du dashboard;
- l’écouteur Supabase synchronise encore l’utilisateur actif mais ne redirige plus;
- la redirection reste effectuée par le flux explicite après relecture réussie de la session.

Aucune migration SQL supplémentaire.

## Synchronisation renforcée

Avant toute navigation vers `/dashboard`, le navigateur vérifie désormais via `/api/auth/session-ready` que la session est réellement lisible par le serveur. La vérification est réessayée brièvement et échoue avec un message clair au lieu de laisser tourner un chargement infini.
