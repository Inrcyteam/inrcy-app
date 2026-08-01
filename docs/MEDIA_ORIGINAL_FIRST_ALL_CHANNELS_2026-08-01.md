# Média Original First — images et vidéos (2026-08-01)

- Toute image et toute vidéo reste originale par défaut sur tous les canaux.
- Une image devient `Personnalisée` uniquement via la provenance explicite du bouton Adapter.
- Les différences de transforms techniques client/serveur ne peuvent plus reclasser une image intacte.
- Les canaux compatibles reçoivent une optimisation proportionnelle sans canevas ni bandes.
- Une adaptation automatique strictement nécessaire utilise un recadrage léger (perte <= 8 %) ou un fond flouté, jamais des bandes blanches/noires.
- Les vidéos ne prennent plus un format recommandé par défaut. Une variante n'est utilisée qu'après application explicite et correspondance exacte de signature.
- L'iframe Site Web suit le ratio naturel de l'image ou de la vidéo active.
- Les versions de cache channel_publish image et vidéo passent à v3 afin d'ignorer les anciennes variantes encadrées.
