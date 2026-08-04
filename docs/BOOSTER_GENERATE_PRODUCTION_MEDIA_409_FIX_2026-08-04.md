# Booster Generate - correctif production 409 medias

## Incident

En production, `/api/booster/generate` renvoyait `409 workspace_media_not_ready` avec le message `Les médias sont encore en cours de préparation.` alors que les images originales étaient déjà uploadées.

## Cause

Le lecteur commun du workspace imposait à la génération IA les états de la mission publication :

- `processing_status = ready`
- `publication_status = ready | legacy_ready`

La génération IA dépendait donc à tort de la préparation publication.

## Correction

- Ajout d'une autorisation explicite `allowUploadedImageSourceForAi` réservée au résolveur IA.
- Une image est consommable par l'IA dès que l'upload est confirmé et que son chemin Storage existe.
- Si `ai_preview` ou `canonical` est déjà prêt, il est réutilisé.
- Sinon, un JPEG sécurisé pour le fournisseur IA est produit directement en mémoire depuis l'original.
- Aucune variante de publication n'est requise ou matérialisée par ce secours IA.
- Le résolveur publication conserve ses contrôles historiques stricts.

## Validation

- Nouveau test de non-régression : 3/3.
- Batterie média ciblée : 100/100.
