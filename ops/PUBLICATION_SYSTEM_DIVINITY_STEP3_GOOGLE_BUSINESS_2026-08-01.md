# Système de publication — Étape 3 : Google Business blindé

Date : 1er août 2026

## Objectif

Réduire les rares échecs médias Google Business sans modifier le comportement des autres canaux ni bloquer une publication dont le texte peut être publié.

## Contrat vidéo

- La source iNrCy reste acceptée jusqu’à 300 Mo.
- Google Business applique une limite officielle de 75 Mo avec une cible interne de 72 Mo décimaux.
- La durée maximale est de 30 secondes.
- Le côté court doit atteindre au moins 720 px.
- Une source déjà conforme est réutilisée sans recompression.
- Une source trop lourde ou trop petite reçoit une variante MP4 dédiée.
- Une vidéo de plus de 30 secondes n’est jamais coupée automatiquement : le texte est publié sans vidéo avec avertissement.
- La signature `google_business` empêche de confondre cette variante avec celles des autres canaux.

## Contrat image

- JPEG conforme entre 10 Ko et 5 Mo, avec une cible interne sous 4,8 Mo.
- Côté court d’au moins 250 px.
- Aucun nouveau recadrage après validation Adapter.
- Contrôle HTTP de l’URL avant l’appel Google : HTTPS, statut, type MIME et poids.
- Trois essais courts combinant HEAD puis GET avec Range pour absorber les délais de disponibilité du stockage.

## Comportement de secours

Si le média ne peut pas être récupéré ou ne respecte pas le contrat, Google Business publie le texte. Le canal reste livré avec un avertissement `published_without_image` ou `published_without_video` afin que le pro puisse corriger depuis iNrSend ou directement sur Google.

## Périmètre inchangé

- Aucun changement Meta.
- Aucun changement de transparence des canaux Site/iNrSearch.
- Aucun changement du statut final global, réservé à l’étape bilan.
- Aucun changement SQL requis.

## Certification

```bash
npm run qa:publication-system:step3
```
