# Publication System - Étape 2 - Adapter exact

## Objectif

Garantir que la personnalisation Adapter reste liée au couple **canal + média** et qu'une sélection partielle conserve exactement son ordre et son contenu jusqu'à la publication serveur.

## Invariants verrouillés

- Un média personnalisé est prioritaire uniquement pour la clé média concernée et le canal concerné.
- Les autres médias restent originaux, sauf adaptation technique obligatoire du canal.
- « Appliquer à tous » enregistre une provenance explicite pour chaque média sélectionné.
- Une sélection partielle n'est plus remplacée silencieusement par tous les médias du workspace.
- Une sélection explicitement vide reste vide ; seuls les anciens payloads sans champ `imageKeys` bénéficient du fallback de compatibilité.
- Les clés obsolètes et les personnalisations hors sélection sont ignorées.
- Le cache de variante reste isolé par média, canal, mode et transformation.

## Validation

Commande de certification :

```bash
npm run qa:publication-system:step2
```

Contrôles complémentaires : TypeScript, lint ciblé, tests Booster images, règles médias et tests dashboard.
