# Correctifs iNr’Search, iframe vidéo et stabilité mobile — 31 juillet 2026

## Périmètre

Correctifs ciblés appliqués au ZIP `inrcy-app-complet(1).zip` sans modification de la logique de publication des autres canaux.

## Correctifs

### 1. Vidéos publiées sur le site

- Les vidéos privées des buckets `booster` et `inrcy-pro-media` sont maintenant servies par une URL iNrCy stable.
- Le serveur recrée une URL Supabase signée à chaque consultation à partir du bucket et du chemin de stockage durables.
- Les nouvelles URL iNrCy sont protégées par un HMAC serveur.
- La compatibilité historique sans HMAC est limitée au seul bucket `booster` utilisé par l’ancien iframe.
- `video_path`, les métadonnées vidéo et les miniatures sont pris en charge.
- Les textes d’erreur corrompus ont été rétablis en UTF-8.

### 2. Panneau Configuration iNr’Search

- Surcharge locale de la règle mobile globale qui empêchait le retour à la ligne.
- Textes, boutons, statut et URL publique restent dans la largeur du drawer.
- Mise en page tactile renforcée sans modifier les autres panneaux du dashboard.

### 3. Logo des fiches publiques

- Normalisation des anciens chemins contenant encore le préfixe `logos/`.
- Recherche du premier logo réellement disponible entre le profil du compte professionnel et celui du propriétaire authentifié.
- Vérification de l’existence de l’objet avant sélection, avec conservation du fallback visuel si aucun logo n’existe.

### 4. Flashs et sauts blancs sur mobile

- Surface sombre opaque appliquée à `html`, `body`, la page, le viewport et chaque scène iNr’Search.
- Panneaux horizontaux dimensionnés à `100%` plutôt qu’à `100vw` dans le viewport.
- Une seule couche conserve le défilement inertiel principal afin de réduire les défauts de composition mobile.
- Correction de l’état `aria-hidden` / `inert` des scènes inactives.

## Tests exécutés

- QA iNr’Search : **106/106 contrôles réussis**.
- Tests iNr’Search : **23/23 réussis**.
- Tests logo/profil : **7/7 réussis**.
- Tests dashboard/publication : **88/88 réussis**.
- Règles médias : **4/4 réussies**.
- Consommation unifiée du pipeline média étape 7 : **9/9 réussis**.
- TypeScript : **0 erreur**.
- ESLint ciblé sur tous les fichiers modifiés : **0 erreur**.

## Limitation de l’environnement de contrôle

Le `next build` a été lancé mais n’a pas pu aller jusqu’à la compilation dans ce conteneur Linux : le ZIP fourni embarque les binaires natifs Windows de Next/SWC et Sharp, tandis que le registre npm interne de l’environnement ne possède pas les paquets Linux correspondants. L’échec intervient au téléchargement du binaire `@next/swc-linux-x64-gnu`, avant la compilation du projet. Il ne s’agit pas d’une erreur TypeScript ou d’une erreur causée par les correctifs.
