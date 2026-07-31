# Dashboard — préchargement des outils et navigation tactile (31/07/2026)

## Objectifs

- Ne plus perdre un clic pendant la vérification Profil / Activité.
- Précharger les routes et les dernières données utiles des outils depuis le Dashboard.
- Afficher immédiatement un dernier état connu, puis actualiser silencieusement.
- Garantir des boutons Précédent / Suivant tactiles et responsive, sans geste de swipe.

## Correctifs

- Les contrôles Profil / Activité ne bloquent plus les clics pendant leur chargement. Un compte réellement incomplet est guidé vers le panneau manquant au lieu de subir un clic sans effet.
- Préchargement Next des outils visibles : Booster, iNrSend, CRM, Calendar, Propulser, Fidéliser, Factures, Devis, Stats, E-réputation, GPS, iNrAgent et Médiathèque.
- Préchauffage account-scoped des instantanés CRM, iNrSend, Calendar, Propulser, Fidéliser, Factures, Devis, iNrAgent et Médiathèque.
- Les écrans concernés utilisent l'instantané disponible dès le premier rendu, puis mettent les données à jour en arrière-plan.
- Navigation tactile précédente / suivante conservée sur mobile, tablette et desktop pour iNrSend, CRM, Calendar, Propulser et Fidéliser.
- iNrCRM peut désormais passer à la page précédente ou suivante depuis la modale mobile.
- Aucun geste de swipe horizontal n'a été ajouté.

## Limite volontaire

Un tout premier accès sur un navigateur sans aucun cache, ou un rechargement réseau complet après suppression du stockage local, nécessite toujours une requête serveur. Les visites suivantes réutilisent le dernier état account-scoped pendant l'actualisation silencieuse.

## Contrôles exécutés

- Dashboard : 92/92
- iNrSend : 46/46
- Multicompte : 54/54
- Onboarding : 36/36
- iNrAgent : 10/10
- Passerelles vidéo iNrAgent : 17/17
- Intégration Booster / iNrAgent / iNrSend : 3/3
- Règles médias : 4/4
- Vérification de syntaxe TypeScript des fichiers modifiés : OK
