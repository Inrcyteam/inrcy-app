# Correctif TikTok - retour photo 13 h 30 + récupération vidéo

- Le parcours photo TikTok a été remis strictement à l'état du ZIP de 13 h 30 : sélection des chemins, proxy signé, préparation photo et retry.
- Les ajouts ultérieurs devenus inutiles ont été retirés : endpoint cron TikTok, watcher dédié, cache photo v3, contournement direct et tests associés.
- La seule différence fonctionnelle conservée concerne la vidéo TikTok : le serveur essaie successivement la variante du canal, sa vidéo source, puis la vidéo source de la publication.
- Aucun changement n'a été appliqué aux autres canaux.
