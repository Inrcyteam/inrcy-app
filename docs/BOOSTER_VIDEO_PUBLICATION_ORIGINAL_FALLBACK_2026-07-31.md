# Booster - Correctif publication vidéo et compteur Google Business (31/07/2026)

- Google Business sélectionne désormais par défaut toutes les images ajoutées, comme les autres canaux compatibles.
- Une publication vidéo ne lance plus silencieusement FFmpeg pour un format simplement recommandé.
- Les variantes sont générées uniquement après clic explicite sur « Appliquer ce format ».
- Au moment de publier ou programmer, iNrCy réutilise une variante déjà prête ; sinon il publie la source originale lorsqu’elle respecte la politique du canal.
- Une source réellement incompatible reste bloquée avec la raison précise (poids, format ou durée).
- Le contrôle est appliqué à la fois dans le préchauffage du workspace et dans `/api/booster/publish-now`.
