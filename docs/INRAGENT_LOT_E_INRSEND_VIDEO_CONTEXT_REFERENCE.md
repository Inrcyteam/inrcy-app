# iNrAgent — Lot E : référence vidéo partagée avec iNrSend

## Objectif

Permettre à un brouillon de publication iNrSend issu d'iNrAgent de réutiliser le contexte vidéo persistant du Lot C sans relancer l'extraction FFmpeg, la transcription ou l'analyse locale du navigateur.

## Référence conservée

Le brouillon `app_events/publish_draft` conserve une petite référence JSON :

- `mediaAssetId` : identifiant de la vidéo dans `pro_media_library` ;
- `videoAiContextVersion` : version du pipeline de préparation ;
- `videoFingerprint` : empreinte SHA-256 de la vidéo source ;
- `videoAiContextRef` : forme canonique versionnée regroupant ces informations.

La transcription et les images Base64 ne sont jamais copiées dans iNrSend.

## Réouverture depuis iNrSend

À l'ouverture du brouillon :

1. le média de publication reste restauré pour la prévisualisation et l'envoi ;
2. le navigateur détecte la référence persistante ;
3. il ne lance ni extraction des captures ni extraction audio ;
4. lors d'une nouvelle génération, seule la référence est transmise à `/api/booster/generate` ;
5. la route charge directement la transcription et les trois captures privées déjà stockées par iNrAgent.

Le chargeur serveur est strictement en lecture seule : il ne télécharge pas la vidéo source, ne lance pas FFmpeg et ne déclenche aucune transcription.

## Modification et remplacement

- modification des textes, canaux ou réglages : référence conservée ;
- nouvelle sauvegarde du même brouillon : référence conservée ;
- duplication du contenu entre canaux : référence inchangée ;
- remplacement ou suppression de la vidéo : référence explicitement supprimée ;
- ancien client qui ne renvoie pas la référence : conservation uniquement si le chemin de la vidéo du brouillon est strictement identique ;
- ancien brouillon sans référence : comportement Booster historique, avec préparation locale best-effort.

## Sécurité

La référence n'est acceptée que si :

- le média appartient à l'établissement actif ;
- il provient de `pro_media_library` ;
- la version demandée correspond à la version courante et stockée ;
- l'empreinte demandée correspond à la source actuelle et à la valeur stockée.

Une référence invalide ne déclenche aucun retraitement automatique et la génération reste non bloquante avec les métadonnées disponibles.

## Migration

Aucune nouvelle migration SQL. La migration du Lot C reste nécessaire :

`ops/sql/2026-07-15_inragent_video_ai_context_cache.sql`
