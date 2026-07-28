# iNrAgent — galerie média des publications programmées

Correctif du 28 juillet 2026.

- **Ajouter une image** ajoute désormais l’image à la galerie du canal au lieu de remplacer l’image sélectionnée.
- La galerie accepte **5 images maximum par canal**.
- **Adapter l’image** remplace uniquement l’image active.
- **Supprimer cette image** retire uniquement l’image active.
- L’ajout d’une vidéo remplace la galerie d’images du canal afin de ne jamais mélanger vidéo et photos.
- Le comportement est identique pour un import direct et pour la Médiathèque.
- Le serveur applique également la limite de 5 images et refuse un sixième ajout avec une réponse 409 explicite.
