# Booster — audit global publication et programmation simplifiée

Date : 30 juillet 2026

## Résultat

Le socle cumulé des étapes 1 à 5 a été revérifié dans le ZIP final. Les protections sont toujours présentes et compatibles entre elles :

- génération IA : anti-rafale à 20/minute, aucun retry immédiat sur un 429 utilisateur, messages quota/anti-rafale/fournisseur distincts, erreurs visuelles dédupliquées ;
- médias vidéo : limite source iNrCy à 300 Mo, contrôle du format, de la durée et du poids selon le canal, sans ancien plafond global artificiel de 40 Mo ;
- TikTok : vidéo envoyée uniquement par `FILE_UPLOAD`, vrai statut et vrai motif d'échec conservés, suivi automatique dans iNrSend ;
- publication : idempotence, réponse mobile perdue relancée avec la même clé, bilan partiel canal par canal, relance limitée aux canaux éligibles en échec ;
- publication asynchrone : une tâche durable par canal, verrou indépendant, agrégation finale et reprise par cron.

## Petite correction supplémentaire issue de l'audit

Le cron de récupération ne relance plus toutes les tâches `processing` à chaque minute. Il relance :

- immédiatement les tâches encore `queued` ;
- uniquement les tâches `processing` devenues réellement anciennes, après expiration du verrou de 5 minutes et une marge de 30 secondes.

Cela supprime des appels inutiles et évite de solliciter un canal encore en cours de traitement.

## Nouvelle programmation Booster

La modale partagée propose maintenant deux modes :

1. **Programmation générale** — mode par défaut. Une date et une heure sont appliquées à tous les canaux prêts.
2. **Programmation par canal** — section repliée par défaut. Son ouverture affiche le détail complet afin de choisir des créneaux différents ou de laisser certains canaux partir immédiatement.

Lorsqu'une programmation existante contient tous les canaux au même créneau, la modale se rouvre automatiquement en mode général. Si les créneaux diffèrent, elle se rouvre en mode par canal.

## Validation locale

- TypeScript : OK
- ESLint ciblé sur les fichiers modifiés : OK
- Tests Dashboard : 32/32
- Tests IA : 165/165
- Tests pipeline média : 93/93
- Tests vidéo par canal : 5/5
- Tests TikTok : 6/6
- Tests Pinterest : 9/9
- Tests iNrSend : 31/31

Total contrôlé : **341 tests réussis**.

## Déploiement

Aucun SQL et aucune nouvelle variable ne sont nécessaires.

Le mode asynchrone dépend toujours du secret cron déjà prévu par l'application : `VERCEL_CRON_SECRET` ou `CRON_SECRET`. S'il n'est pas défini sur Vercel, le code conserve volontairement le fonctionnement synchrone de secours.

Après déploiement, réaliser les smoke tests suivants : 1 image, 5 images, vidéo courte, vidéo lourde compatible, succès partiel avec un canal volontairement indisponible, puis programmation générale et programmation par canal.
