# YouTube Shorts — Étape 7 : validation terrain et diagnostic

Cette étape ajoute un contrôle de santé YouTube Shorts pour confirmer que la connexion est vraiment exploitable avant de tester des publications clients.

## Ajouts

- Route serveur : `/api/integrations/youtube-shorts/diagnostics`.
- Bouton dans la configuration : `Tester la connexion`.
- Vérifications réalisées :
  - OAuth actif.
  - Scopes YouTube présents : upload, readonly, analytics.
  - Chaîne YouTube accessible via `channels?mine=true`.
  - YouTube Analytics accessible via `reports.query`.
  - Refresh token utilisé si le token d'accès est expiré.

## Résultat attendu

Le diagnostic doit indiquer :

- OAuth OK
- Chaîne OK
- Analytics OK
- Upload OK

Si tout est OK, le canal est prêt pour le test réel de publication vidéo depuis Booster.

## Validation Google

Les scopes YouTube `youtube.upload`, `youtube.readonly` et `yt-analytics.readonly` restent sensibles. L'écran d'avertissement Google peut donc rester visible tant que Google n'a pas validé l'application.

La validation Google ne bloque pas le test sur les comptes autorisés, mais elle sera nécessaire avant ouverture large aux clients.

## Test recommandé

1. Configuration YouTube Shorts → `Tester la connexion`.
2. Si OK, publier une vidéo courte depuis Booster.
3. Vérifier le lien dans iNrSend.
4. Vérifier la vidéo dans YouTube Studio.
5. Attendre la remontée analytics dans iNrStats.
