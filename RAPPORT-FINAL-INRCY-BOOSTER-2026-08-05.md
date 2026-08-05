# Livraison finale — Booster Publier iNrCy

Date : 5 août 2026

## Résultat

La rapidité de génération validée sur la livraison précédente est conservée. La nouvelle livraison concentre les changements sur la fiabilité et la fluidité de la publication, de la programmation, des brouillons et du suivi iNrSend.

Le parcours produit est désormais verrouillé ainsi :

1. sélection des canaux ;
2. choix IA ou Manuel ;
3. en IA, insertion de **5 images maximum OU 1 vidéo** — jamais les deux ;
4. dans le bloc Médias de la publication, pool partagé de **5 images uniques maximum + 1 vidéo unique** ;
5. sous-ensemble, ordre, type de média et adaptations indépendants pour chaque canal ;
6. publication parallèle, bilan rapide, puis poursuite durable en arrière-plan si un fournisseur tarde.

## Médias multicanaux

- Une image ou une vidéo physique n'est uploadée qu'une fois dans le workspace Supabase.
- Chaque canal conserve son mapping. Exemple certifié : A = `[A,B,C]`, B = `[A,D,E]`, C = `[C,D]`, E = vidéo.
- Un canal vide réutilise le pool avec « Utiliser les images existantes ici » ou « Utiliser la même vidéo ici ».
- Retirer un média d'un canal ne supprime que son affectation.
- La suppression physique est explicitement libellée « de tous les canaux ».
- Les nouvelles images ajoutées pour un canal ne sont jamais affectées automatiquement aux autres.
- Brouillons et programmations restaurent les sous-ensembles, l'ordre, les adaptations et la vidéo.

## Rapidité et vidéos lourdes

- La génération ne charge et n'attend que la famille choisie : images **ou** vidéo.
- Une source compatible reste originale. Le fichier original est toujours conservé.
- Jusqu'à 70 Mo, aucune compression générale inutile n'est imposée.
- Au-delà, un master canonique préparé en arrière-plan n'est préféré que s'il apporte un gain matériel ; Google Business reçoit sa variante dédiée sous sa limite de 70 000 000 octets.
- Facebook laisse Meta récupérer la vidéo depuis l'URL Supabase.
- LinkedIn, TikTok, YouTube et Pinterest utilisent des transports streamés, découpés ou reprenables ; aucun chargement monolithique de 300 Mo en mémoire.
- Les checkpoints YouTube, TikTok et Pinterest sont persistés avant les mutations fournisseur afin d'éviter les doublons après une coupure.
- Une erreur média sur un canal n'empêche jamais les autres canaux prêts de partir.
- Après le plafond d'attente visible, les canaux encore actifs restent « En traitement » et continuent sans garder Booster ouvert.

## Publication, programmation et iNrSend

- Une tâche durable distincte est créée par canal.
- Les identifiants enfants sont déterministes : une reprise ne recrée pas une publication.
- Les états ambigus des fournisseurs ne déclenchent jamais une seconde création aveugle.
- iNrSend hydrate rapidement l'historique, affiche les tâches en traitement et reprend le suivi du bilan final.
- La programmation réutilise le même workspace média et le même moteur durable que la publication immédiate.
- Les brouillons ne provoquent aucun second upload lors de leur réouverture.

## Supabase

La migration `ops/sql/2026-08-05_booster_mixed_media_workspace.sql` a déjà été appliquée et contrôlée sur la production :

- cinq positions image et une position vidéo distincte ;
- migration compatible avec les anciennes vidéos en position 0 ;
- index de file, d'activité, de métriques et de réconciliation valides ;
- agrégation des livraisons au niveau instruction, sans tempête de triggers ligne par ligne ;
- insertion/suppression de contrôle du workspace mixte validée.

Il n'y a **aucun SQL supplémentaire à exécuter avant le prochain build** sur cette base Supabase.

## Validation finale

- Tests automatisés Node : **1 129 / 1 129 réussis** dans 30 familles.
- Dashboard et parcours Booster : **199 / 199**.
- Moteur de publication : **171 / 171**.
- Pipeline média : **178 / 178**.
- iNrSend : **58 / 58**.
- Pinterest : **38 / 38**.
- TikTok : **23 / 23**.
- Passerelle IA : **175 / 175**.
- TypeScript global : réussi.
- ESLint global : réussi.
- Build Next.js 16.2.11 : réussi, `BUILD_ID` final `WQ5eSqyKvpJMBxogMiAkR`.
- Playwright : **52 scénarios E2E détectés et chargés sans erreur**. Les scénarios authentifiés/live devront être rejoués par la CI après déploiement, car les secrets Vercel ne sont volontairement pas présents dans le ZIP.
- Dépendances installées cohérentes avec le lockfile.
- Aucun identifiant du compte test, `.env`, état d'authentification ou secret dans la livraison.

## Optimisation de packaging serveur

Le traçage de la fonction `publish-now`, auparavant élargi par un accès fichier Pinterest dynamique, a été ramené de **2 261 à 373 fichiers**. Les tests, la documentation et le reste du dépôt ne sont plus embarqués dans cette fonction. Cela réduit son poids et améliore le démarrage à froid.

## Déploiement

1. Extraire le ZIP dans un chemin court, par exemple `C:\inrcy-app`.
2. Remplacer le contenu du dépôt avec le dossier livré.
3. Ne pas ajouter `node_modules`, `.next`, `.env` ou `playwright/.auth` au dépôt.
4. Laisser GitHub/Vercel exécuter `npm ci` puis `npm run build` avec les variables déjà configurées.
5. Ne pas rejouer le SQL sur la base de production actuelle.
6. Après déploiement, exécuter la CI E2E authentifiée et un smoke réel avec le compte test : Génération images, Génération vidéo, mixage Publication, Brouillon, Programmation et bilan iNrSend.

