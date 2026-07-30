# Correctif vidéo FFmpeg — chemin rapide et progression réelle

Date : 30 juillet 2026

## Problème observé

Après la fin de l'upload TUS, les vidéos restaient affichées à 20–25 % pendant plusieurs minutes. Le worker exécutait un réencodage H.264 complet du MP4 canonique, puis fabriquait un second film pour l'IA avant les captures et l'audio. Aucune progression fine n'était persistée entre le téléchargement de la source et la fin de cette chaîne.

## Correctif

- Analyse du codec, du format, du pixel format, de la rotation et de l'audio avant traitement.
- Chemin rapide pour les sources MP4/H.264 compatibles : copie du flux vidéo et remux MP4 `faststart`, sans réencodage complet.
- Transcodage complet conservé uniquement pour les sources incompatibles, trop grandes, tournées ou dépassant les limites du canonique.
- Suppression du second réencodage vidéo dédié à l'IA : les captures serveur et la piste audio restent le contexte IA principal, avec repli sur le canonique dans la consommation unifiée.
- Extraction de l'audio et des captures directement depuis la source, en parallèle de la préparation du canonique.
- Progression FFmpeg lue via `-progress pipe:1`, puis persistée de 21 à 72 % dans le job média.
- Watchdog d'inactivité et délai maximal : un FFmpeg réellement figé est arrêté et produit une erreur explicite au lieu de laisser l'interface bloquée indéfiniment.
- Conservation du ciblage exact du job vidéo, du transport TUS signé, du registre média et des variantes de publication.

## Vérifications

- 79 tests JavaScript du pipeline média réussis.
- 34 tests TypeScript de règles média réussis.
- Vérification syntaxique TypeScript des fichiers modifiés réussie.
- Essais locaux avec FFmpeg réel :
  - MP4 H.264/AAC 720p, 20 s : chemin `stream_copy`, environ 0,5 s de normalisation locale.
  - MP4 H.264/AAC 1080p, 60 s : chemin `stream_copy`, environ 0,8 s de normalisation locale.
  - WebM/VP9 incompatible : chemin `full_transcode`, progression continue jusqu'à 100 %.

Ces durées locales valident les chemins de code mais ne constituent pas une garantie de durée identique sur Vercel.

## Déploiement

Aucun SQL, aucune variable et aucun changement de flag ne sont nécessaires. Pour un test propre, retirer l'ancien média bloqué puis ajouter une nouvelle vidéo après déploiement et actualisation forcée du navigateur.
