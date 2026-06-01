# Étape vidéo 9 — Brouillons et variantes vidéo

Cette étape rend les brouillons vidéo plus intelligents :

- les variantes vidéo générées sont conservées dans `videoDraft.transformedVariants` ;
- au chargement d’un brouillon, les variantes sont normalisées puis replacées dans l’état du modal ;
- les canaux dont la variante est déjà disponible passent directement en `Format prêt` ;
- la préparation vidéo réutilise les signatures existantes (`format:adaptationMode`) pour éviter une régénération inutile ;
- la sauvegarde d’un brouillon réutilise la source vidéo déjà stockée si elle existe, au lieu de réuploader systématiquement la même vidéo.

Une nouvelle vidéo ajoutée par le pro réinitialise toujours les variantes, pour éviter de réutiliser une variante liée à une ancienne source.
