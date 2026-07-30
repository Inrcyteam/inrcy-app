# Correctif TUS signé — 30 juillet 2026

## Incident constaté

Les médias de plus de 6 Mo étaient bien orientés vers le transport résumable TUS, mais le client utilisait l'endpoint d'upload authentifié classique :

`/storage/v1/upload/resumable`

alors que les intents iNrCy reposent sur un token produit par `createSignedUploadUrl`. Le transport signé doit utiliser :

`/storage/v1/upload/resumable/sign`

Le navigateur pouvait envoyer le premier chunk de 6 Mo puis recevoir un refus, ce qui expliquait les blocages observés aussi bien avec les vidéos qu'avec les images volumineuses.

## Correction

- endpoint TUS signé Supabase corrigé avec le hostname Storage direct ;
- ajout de la clé publique Supabase (`apikey`) sur POST, HEAD et PATCH ;
- maintien du token temporaire dans `x-signature` ;
- maintien des chunks obligatoires de 6 Mo et des reprises automatiques ;
- invalidation des anciennes URL de reprise locales créées avec le mauvais endpoint ;
- arrêt immédiat et propre de Générer / Publier / Programmer si un upload a réellement échoué, au lieu d'attendre jusqu'au timeout ;
- message d'erreur réel conservé pour faciliter un diagnostic ultérieur.

## Périmètre

Le correctif agit sur le transport commun des images et des vidéos. Les limites produit restent :

- 5 images maximum ;
- 50 Mo par image ;
- 150 Mo au total ;
- 1 vidéo source jusqu'à 300 Mo.

Aucun binaire lourd ne repasse par une route Vercel. Aucun SQL et aucune nouvelle variable d'environnement ne sont nécessaires.

## Validation locale

- tests du pipeline média : 71 réussis ;
- tests des règles médias : 4 réussis ;
- tests ciblés endpoint signé, headers, reprise locale et arrêt rapide : réussis ;
- analyse syntaxique TypeScript des quatre fichiers modifiés : réussie.

Le typecheck et le build complets doivent être rejoués dans l'environnement projet disposant de toutes les dépendances npm.
