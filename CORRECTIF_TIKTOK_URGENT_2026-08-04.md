# Correctif TikTok urgent — 4 août 2026

## Photos

- TikTok reçoit de nouveau en priorité la variante sociale/TikTok déjà préparée dans le stockage.
- L’image source originale n’est utilisée qu’en secours si aucune variante complète n’existe.
- Cela évite une conversion Sharp froide pendant que TikTok tente de télécharger l’image, cause possible des statuts `PROCESSING_DOWNLOAD` persistants.

## Vidéos

- Suppression du préchauffage vidéo anticipé réutilisé entre génération et publication, qui pouvait conserver une promesse liée à un état de workspace devenu obsolète.
- La publication refait désormais le contrôle du workspace au moment réel de l’envoi.
- Le serveur essaie successivement la variante TikTok, la vidéo source associée puis la source de publication, uniquement si chaque source de secours respecte la politique TikTok.
- Le diagnostic indique les chemins de stockage tentés et le fichier réellement utilisé.

## Périmètre

Le correctif est limité au flux TikTok et au préchauffage vidéo du module Booster. Les autres canaux et leurs règles de publication ne sont pas modifiés.
