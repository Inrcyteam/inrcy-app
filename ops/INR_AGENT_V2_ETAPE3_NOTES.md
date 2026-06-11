# iNr'Agent V2 — Étape 3

Objectif : brancher la page iNr'Agent aux vraies actions préparées et rendre les boutons Valider / Refuser fonctionnels.

## Modifications réalisées

- La page `/dashboard/agent` charge maintenant les actions depuis `/api/agent/actions`.
- L'aperçu central affiche la vraie action préparée de l'automatisation sélectionnée :
  - titre,
  - résumé / contenu,
  - image issue de `image_assets` ou du `payload`,
  - canaux ciblés,
  - thème,
  - outil cible,
  - statut,
  - date programmée.
- Les cartes d'automatisation affichent un badge `à valider` quand une ou plusieurs actions sont en attente.
- Les boutons `Valider` et `Refuser` appellent réellement `PATCH /api/agent/actions`.
- Après validation/refus, l'action est mise à jour localement et disparaît de l'aperçu à valider.
- L'API met maintenant à jour `validated_at`, `refused_at`, `completed_at` et `updated_at` selon le statut reçu.

## Statuts affichés dans l'aperçu

L'aperçu sélectionne uniquement les actions avec statut :

- `prepared`
- `pending_validation`
- `pending`
- `draft`

Les actions `validated`, `refused`, `completed`, etc. restent dans Supabase mais ne sont plus affichées comme action à valider.

## À noter

Cette étape ne crée pas encore les actions automatiquement. Elle prépare l'interface et les APIs pour afficher et valider les actions quand le moteur iNr'Agent les générera.

Prochaine étape logique : créer la route serveur qui prépare une première publication Booster / Publier réelle à partir du profil pro, des canaux actifs et de la banque d'images.
