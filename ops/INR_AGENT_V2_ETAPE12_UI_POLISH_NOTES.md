# iNrAgent V2 — Étape 12 — Polish UI aperçu par canal

## Objectif

Retravailler la page iNrAgent pour rendre l’aperçu plus clair côté professionnel.

## Modifications

- Suppression de la bulle visible `Garde-fous actifs` sur l’écran principal.
- Conservation de l’explication dans le helper `?`, comme dans les autres outils.
- Simplification de la ligne de détails sous l’aperçu :
  - suppression des blocs `Image` et `Contenu`, car ces éléments sont déjà visibles dans l’aperçu ;
  - conservation uniquement de `Canaux` et `Date programmée`.
- Transformation des canaux en sélecteur d’aperçu :
  - un clic sur un canal affiche le contenu prévu pour ce canal ;
  - le contenu d’aperçu se remonte depuis `payload.postByChannel` pour Booster / Publier ;
  - les campagnes mail utilisent le contenu de campagne préparé.
- Canaux affichés en ligne horizontale avec scroll doux si nécessaire, pour éviter les retours à la ligne disgracieux.
- Repositionnement propre du bouton `Préparer...` dans l’état vide.
- Ajout d’une micro-animation de transition quand le canal sélectionné change.

## Fichiers touchés

- `app/dashboard/agent/AgentClient.tsx`
- `app/dashboard/agent/agent.module.css`
- `ops/INR_AGENT_V2_ETAPE12_UI_POLISH_NOTES.md`

## SQL

Aucun nouveau SQL à lancer.
