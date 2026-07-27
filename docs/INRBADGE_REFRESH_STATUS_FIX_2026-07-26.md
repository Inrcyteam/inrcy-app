# iNrBadge - statut stable au rafraîchissement

## Problème initial

Le premier correctif empêchait un nouveau compte incomplet d'afficher brièvement iNrBadge comme connecté. Pour rester fail-closed, la bulle affichait toutefois `Synchronisation…` à chaque actualisation, y compris pour un professionnel dont le profil était déjà complet.

## Correction finale

- Le dernier état autoritatif de complétude du profil est mémorisé dans le cache déjà séparé par établissement.
- Au prochain affichage, iNrBadge reprend immédiatement cet état connu :
  - profil complet : `Connecté` sans clignotement ;
  - profil incomplet : `Déconnecté` sans faux vert ;
  - aucun état connu : `Synchronisation…` jusqu'au premier contrôle.
- Le contrôle Supabase continue en arrière-plan et remplace le cache si l'état réel a changé.
- Le cache ne donne aucun droit serveur : il stabilise uniquement l'affichage et les actions visuelles du badge.

## Parcours d'inscription

Les transitions après sauvegarde utilisent maintenant une navigation interne directe :

1. Mon profil -> Mon activité
2. Mon activité -> Configuration IA
3. Configuration IA -> Dashboard

Cette navigation ne passe pas par le guard « modifications non enregistrées » puisque chaque formulaire vient d'être sauvegardé et remis à l'état propre. Le guard reste actif lors d'une fermeture manuelle, d'un clic sur « Passer » ou d'une vraie tentative de quitter avec des modifications non enregistrées.

## Validation

- Suite ciblée onboarding : 36 tests réussis.
- Transpilation TypeScript des fichiers modifiés : réussie.
