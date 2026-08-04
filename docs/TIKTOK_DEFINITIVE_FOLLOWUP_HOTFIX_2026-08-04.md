# Correctif TikTok définitif — suivi et photos stables

## Causes corrigées

- La tâche Vercel `/api/cron/tiktok-publications` était configurée mais la route avait disparu, ce qui produisait des 404 et interrompait le suivi automatique.
- La fenêtre de vérification initiale de TikTok était trop courte pour les photos en `PULL_FROM_URL`.
- La route publique média pouvait réencoder une image à chaque requête HEAD/GET de TikTok.

## Nouveau fonctionnement

1. L'image définitive est matérialisée une seule fois dans `booster/tiktok-ready` lorsqu'une conversion est nécessaire.
2. Booster préchauffe chaque URL photo avec HEAD avant l'appel TikTok Direct Post.
3. TikTok reçoit ensuite une URL stable avec les mêmes octets, le même type MIME et la même taille.
4. La vérification immédiate couvre environ 24 secondes.
5. Si TikTok traite encore le contenu, le cron minute reprend le suivi et met à jour iNrSend et `publication_deliveries` jusqu'au succès ou à l'échec.

Les vidéos restent exclusivement en `FILE_UPLOAD`. Les photos restent en `PULL_FROM_URL`, conformément au contrat TikTok.
