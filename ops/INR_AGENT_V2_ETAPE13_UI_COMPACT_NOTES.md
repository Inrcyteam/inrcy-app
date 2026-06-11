# iNrAgent V2 — Étape 13 — UI aperçu compact

## Objectif

Optimiser la page iNrAgent pour gagner de la hauteur et supprimer les doubles blocs dans l'aperçu.

## Modifications

- Suppression visuelle du titre `Aperçu de l’action préparée`.
- Passage à un bloc unique d'aperçu : plus de bloc intérieur borduré dans le bloc parent.
- Déplacement des boutons `Valider` / `Refuser` dans la colonne de droite, alignés sur la largeur du bloc aperçu.
- La colonne robot de gauche descend maintenant jusqu'en bas de la zone de travail.
- Ligne compacte en bas de l'aperçu :
  - `Canaux :` avec icônes uniquement.
  - `Date :` avec icône calendrier + date.
- Les icônes de canaux restent cliquables pour changer l'aperçu canal par canal.

## Fichiers touchés

- `app/dashboard/agent/AgentClient.tsx`
- `app/dashboard/agent/agent.module.css`
- `ops/INR_AGENT_V2_ETAPE13_UI_COMPACT_NOTES.md`

## SQL

Aucun nouveau SQL.
