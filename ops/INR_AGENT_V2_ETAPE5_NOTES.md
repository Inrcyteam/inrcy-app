# iNr’Agent V2 — Étape 5

## Objectif
Brancher le bouton **Valider** d’iNr’Agent à une vraie exécution Booster / Publier pour les publications préparées.

## Ce qui a été ajouté

- Nouvelle route serveur : `POST /api/agent/actions/execute`
- Exécution réelle des actions `publish` / `booster` / `publication`
- Passage d’une action par les statuts :
  - `executing`
  - `completed` si au moins un canal publie correctement
  - `failed` si Booster retourne une erreur ou si tous les canaux échouent
- Récupération du payload iNr’Agent :
  - `selectedChannels`
  - `postByChannel`
  - `idea`
  - image de la banque iNrCy
- L’image iNrCy est téléchargée depuis le bucket `inrcy-image-bank`, convertie en `dataUrl`, puis envoyée au moteur Booster existant.
- Réutilisation du moteur existant `POST /api/booster/publish-now` pour éviter de dupliquer la logique Facebook / Instagram / Google Business / LinkedIn / sites / TikTok.
- Mise à jour du `payload.execution` de l’action avec :
  - `publicationId`
  - `summary`
  - `results`
  - `executedAt`
  - `skippedChannels`
- Mise à jour de `last_executed_at` dans `inr_agent_automation_settings`.
- La page `/dashboard/agent` appelle maintenant `/api/agent/actions/execute` quand le pro clique sur **Valider**.

## Sécurité V1

- YouTube Shorts est ignoré pendant cette préparation/exécution image/texte, car YouTube nécessite une vidéo. Il sera branché plus tard quand iNr’Agent saura préparer une vidéo compatible.
- Les campagnes Propulser / Fidéliser ne sont pas encore exécutées ici. La route renvoie une erreur claire si l’action n’est pas encore branchée.

## SQL

Aucun nouveau SQL à lancer pour cette étape.
Le script de l’étape 1 doit déjà être appliqué : `ops/SUPABASE_INR_AGENT_V2.sql`.
