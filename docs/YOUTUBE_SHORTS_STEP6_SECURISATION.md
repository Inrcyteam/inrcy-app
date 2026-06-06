# YouTube Shorts — Étape 6 : sécurisation publication

Cette étape renforce la publication YouTube Shorts sans modifier le parcours OAuth validé en étape 5.

## Ajouts

- Messages d'erreur YouTube plus lisibles côté utilisateur.
- Détection des erreurs fréquentes : quota, autorisation/scope, token expiré, vidéo refusée, métadonnées invalides.
- Journalisation plus propre via les diagnostics existants, sans exposer les tokens.
- Tags YouTube transmis avec la vidéo (`Shorts`, `iNrCy` et hashtags normalisés du post).
- Retour du statut YouTube quand disponible : `uploadStatus` et `processingStatus`.
- Garde-fou poids vidéo côté upload serveur.

## À savoir

- Tant que l'application n'est pas validée par Google pour les scopes YouTube sensibles, l'écran d'avertissement Google peut rester visible.
- Les vidéos publiées via API peuvent mettre quelques minutes à être traitées par YouTube avant d'être visibles ou comptabilisées en stats.
- Les quotas YouTube sont gérés côté Google Cloud. En cas de quota dépassé, iNrCy renvoie maintenant un message clair.

## Test recommandé

1. Connecter YouTube Shorts.
2. Publier une vidéo courte depuis Booster.
3. Vérifier dans iNrSend que le lien `Voir le Short` est présent.
4. Vérifier dans YouTube Studio que la vidéo apparaît.
5. Attendre les stats YouTube avant de valider iNrStats.
