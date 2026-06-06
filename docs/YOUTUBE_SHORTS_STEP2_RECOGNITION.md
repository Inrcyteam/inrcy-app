# YouTube Shorts — Étape 2 : reconnaissance réelle du canal

## Objectif

Faire en sorte que YouTube Shorts soit reconnu partout comme un vrai canal connecté uniquement via OAuth réel.

## Branchements vérifiés

- `lib/channelConnectionState.ts` lit l'intégration réelle `provider=youtube`, `source=youtube_shorts`, `product=youtube_shorts`.
- `/api/booster/connected-channels` renvoie `youtube_shorts=true` uniquement si la connexion OAuth est active et à jour.
- `/api/integrations/channel-states` expose l'état réel au Dashboard et à iNrStats.
- `DashboardClient.tsx` hydrate désormais `youtubeShortsConnected` et `youtubeShortsUrl` depuis `channel-states`, pas seulement depuis `pro_tools_configs`.
- La bulle Dashboard utilise aussi l'URL issue des blocs iNrStats quand elle est disponible.
- iNrBadge reçoit le canal YouTube Shorts comme partageable uniquement si OAuth réel + URL chaîne sont présents.

## Résultat attendu

- Non connecté : bulle YouTube Shorts = `A connecter`, Booster ne le sélectionne pas.
- Connecté OAuth : bulle YouTube Shorts = `Connecté`, bouton `Voir la chaîne`, Booster peut le proposer.
- Déconnecté : retour immédiat en `A connecter`.

## Étape suivante

Étape 3 : publication réelle vidéo YouTube Shorts depuis Booster.
