# Onboarding dashboard — premier démarrage plein écran

## Comportement

- L'état d'onboarding de l'établissement actif est préchargé côté serveur avant l'hydratation du dashboard.
- Lors du tout premier parcours uniquement, le dashboard reste masqué derrière l'écran de chargement puis les panneaux existants sont présentés dans une vue dédiée plein écran sur desktop.
- Sur téléphone, le comportement plein écran existant est conservé.
- Après la fin ou le report du parcours, Profil, Activité et Configuration IA retrouvent leur présentation latérale habituelle.

## Parcours

1. Mon profil — étape 1/3.
2. Mon activité — étape 2/3.
3. Configuration IA — étape 3/3.

À l'étape 3, une page de choix est affichée avant le formulaire existant :

- `Personnaliser mon IA` ouvre le contenu de Configuration IA.
- `Conserver les réglages par défaut` termine l'onboarding immédiatement.

Le bouton d'en-tête `Passer` affiche une confirmation. Pour Profil et Activité, elle rappelle que les outils dépendants resteront verrouillés. Pour Configuration IA, elle confirme le maintien des réglages recommandés.

## Déploiement

Aucune migration SQL supplémentaire n'est nécessaire. La migration de l'étape 2 reste requise :

`ops/sql/2026-07-25_dashboard_onboarding_state.sql`
