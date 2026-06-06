# YouTube Shorts — étape 5 : stats réelles iNrStats

Cette étape branche YouTube Shorts dans iNrStats avec de vraies données.

## Sources utilisées

1. **YouTube Analytics API**
   - vues
   - minutes regardées
   - durée moyenne de visionnage
   - likes
   - commentaires
   - partages
   - abonnés gagnés / perdus

2. **YouTube Data API / données de connexion**
   - abonnés de la chaîne
   - nombre de vidéos de la chaîne
   - vues totales de la chaîne

3. **iNrCy local**
   - Shorts publiés depuis Booster
   - dernière publication connue

## Fichiers ajoutés / modifiés

- `lib/youtubeShortsAnalytics.ts`
- `lib/stats/buildOverview.ts`
- `docs/YOUTUBE_SHORTS_STEP5_STATS.md`

## Comportement

Dans iNrStats, le cube YouTube Shorts lit maintenant `sources.youtube_shorts.metrics`.

Si l'API YouTube répond : les chiffres sont réels.

Si YouTube refuse temporairement les stats, iNrStats garde un message d'erreur propre et conserve les publications locales iNrCy pour éviter un bloc totalement vide.

## Scopes requis

La connexion OAuth doit contenir au minimum :

- `https://www.googleapis.com/auth/youtube.readonly`
- `https://www.googleapis.com/auth/yt-analytics.readonly`

Ces scopes sont déjà demandés depuis l'étape OAuth.

## À savoir

Les statistiques YouTube peuvent avoir un délai de remontée côté Google. Une vidéo publiée peut donc apparaître immédiatement dans iNrSend, mais ses vues/likes peuvent arriver plus tard dans iNrStats.
