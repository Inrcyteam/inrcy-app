# Livraison média V3 — publication et programmation vidéo

## Résultat

- Les sources MP4/M4V déjà compatibles sont publiées depuis le stockage privé,
  sans téléchargement puis réencodage complet dans une fonction Vercel.
- Publier et Programmer n'attendent plus un préchauffage bloquant à 42 %.
- Une adaptation vidéo FFmpeg n'est créée que si le pro clique explicitement
  sur l'application d'un format ou d'un recadrage. Elle est ensuite persistée
  et réutilisée.
- Les conteneurs non directement publiables (MOV, WebM, AVI, MKV, etc.)
  conservent le parcours de conversion serveur.
- L'initialisation d'un upload n'affiche plus un faux « Upload 0 % » pendant la
  négociation TUS ; le pourcentage affiché ensuite correspond aux octets
  réellement envoyés.
- TikTok reçoit désormais les vidéos de plus de 64 Mo par morceaux séquentiels
  conformes à son protocole d'upload.
- Les erreurs FFmpeg affichées au pro sont compactes et ne montrent plus tout
  le journal technique du binaire.

## Validation locale

- TypeScript : OK
- ESLint sur tous les fichiers modifiés : OK
- Tests média : 140/140
- Build Next.js 16.2.11 : OK, 212 routes/pages collectées

Le build local a utilisé des valeurs Supabase factices uniquement pour la
collecte des pages. Le ZIP ne contient aucun secret ni fichier `.env`.
