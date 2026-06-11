# iNr'Agent V2 — Étape 2

## Objectif
Brancher la page `/dashboard/agent` aux vrais réglages Supabase iNr'Agent V2 au lieu de garder une configuration locale en `useState` uniquement.

## Modifications réalisées

### Page iNr'Agent
Fichier modifié : `app/dashboard/agent/AgentClient.tsx`

- Chargement des réglages via `GET /api/agent/settings` au montage de la page.
- Conversion automatique entre les valeurs Supabase V2 (`weekly`, `site_inrcy`, `validation_required`, etc.) et les libellés affichés dans l'interface.
- Sauvegarde des réglages via `POST /api/agent/settings` depuis les modales de chaque automatisation.
- Persistance par famille d'automatisation :
  - `publish` : Publier régulièrement
  - `grow` : Développer l'activité
  - `loyalty` : Fidéliser les contacts
  - `stats` : Analyser mes statistiques
- Le statut actif/inactif des cartes vient maintenant des réglages Supabase.
- Les canaux, thèmes, fréquence, jour, horaire et mode de validation sont maintenant sauvegardés.
- Le mode Stats est aligné avec la logique validée : bilan automatique après paramétrage.
- Ajout d'un indicateur visuel pendant la synchronisation et si les tables Supabase V2 ne sont pas encore créées.

### Style
Fichier modifié : `app/dashboard/agent/agent.module.css`

- Ajout des pastilles header : synchronisation / tables Supabase à créer.
- Ajout de l'état désactivé propre sur le bouton d'enregistrement.

## Important
Cette étape ne branche pas encore l'affichage des actions préparées. Pour l'instant, la zone d'aperçu reste volontairement vide tant que le moteur de préparation n'existe pas.

## Prochaine étape recommandée
Étape 3 : brancher `/api/agent/actions` dans la page iNr'Agent pour afficher les vraies actions préparées, puis rendre les boutons `Valider` / `Refuser` fonctionnels.
