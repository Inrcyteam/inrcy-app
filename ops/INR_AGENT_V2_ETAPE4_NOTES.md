# iNr'Agent V2 — Étape 4

## Objectif
Brancher la première vraie action préparée : **Publier régulièrement → Booster / Publier**.

## Ce qui a été ajouté

- Nouvelle route serveur : `POST /api/agent/actions/prepare-publish`
  - récupère les réglages V2 de l'automatisation `publish` ;
  - vérifie les canaux Booster / Publier réellement connectés ;
  - choisit un thème autorisé : `Conseils`, `Réalisations`, `Offres`, `Actualités` ;
  - génère une intention pertinente à partir de `Mon profil`, `Mon activité`, prestations, ville et zones ;
  - appelle l'IA Booster avec les prompts déjà existants ;
  - prépare les contenus par canal ;
  - sélectionne une image active dans la banque d'images iNrCy si possible ;
  - enregistre une vraie ligne dans `inr_agent_actions` avec `payload.postByChannel`, `image_assets`, `target_channels`, `target_themes` ;
  - met à jour `last_prepared_at` de l'automatisation.

- Page `/dashboard/agent`
  - ajout d'un bouton **Préparer une publication** quand l'automatisation `Publier régulièrement` n'a pas encore d'action en attente ;
  - l'action créée apparaît directement dans l'aperçu iNr'Agent ;
  - les boutons **Valider / Refuser** de l'étape 3 continuent de fonctionner.

- Route `/api/agent/actions`
  - rafraîchit les URLs signées des images de la banque iNrCy à la lecture des actions.

## À savoir

Cette étape prépare l'action et l'affiche dans iNr'Agent. La validation marque l'action comme validée, mais l'exécution réelle vers Booster / Publier sera branchée dans une étape suivante.

## Pré-requis

Le SQL de l'étape 1 doit être exécuté dans Supabase :

- `ops/SUPABASE_INR_AGENT_V2.sql`

La banque d'images doit contenir au moins une image active si `image_required = true` pour l'automatisation `publish`.
