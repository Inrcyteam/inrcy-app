# Étape 5 — contrôle de non-régression mobile

## Objectif

Valider les corrections des étapes 2 à 4 sans modifier le rendu, les outils métier, les boutons, les bordures ni la logique fonctionnelle de l'application.

## Résultat

Aucun fichier applicatif n'a été modifié pendant cette étape. Seul ce rapport de validation a été ajouté.

### Contrôles réussis

- QA iNrSearch : 106 contrôles sur 106.
- Tests iNrSearch : 19 sur 19.
- Tests stabilité de surface mobile du Dashboard : 3 sur 3.
- Tests onboarding et verrouillage Dashboard : 34 sur 34.
- Tests multicompte : 54 sur 54.
- Tests de sécurité des contenus Booster : 6 sur 6.
- Tests des règles médias : 4 sur 4.
- Analyse syntaxique TypeScript/TSX des trois composants modifiés : validée.
- Analyse syntaxique CSS des quatre feuilles modifiées : validée.

Cela représente 120 tests de non-régression réussis, en plus des 106 contrôles QA iNrSearch.

### Contrôle du périmètre

La comparaison avec le zip original de l'étape 1 confirme :

- 7 fichiers applicatifs modifiés au total par les étapes 2 à 4 ;
- 6 fichiers de documentation ou de tests ajoutés avant cette étape ;
- aucun autre outil modifié ;
- aucun fichier supprimé ;
- aucun CSS obsolète supprimé avant l'étape 6.

Les seuls fichiers applicatifs différents de l'original sont :

- `app/entreprises/[slug]/InrSearchVisualIdentity.tsx`
- `app/entreprises/[slug]/InrSearchExperience.tsx`
- `app/entreprises/[slug]/inrSearchPublic.module.css`
- `app/dashboard/layout.tsx`
- `app/dashboard/dashboard.module.css`
- `app/dashboard/_components/ResponsiveBottomNav.module.css`
- `app/globals.css`

### Test Booster déjà rouge avant les corrections

La suite Booster Images conserve 21 tests réussis sur 22. L'unique échec est strictement identique à celui de la baseline de l'étape 1 :

`Step 3 publishes Originale from the source payload and Adaptée from the matrix plan`

Le test concerné et son fichier cible ont exactement le même SHA-256 dans le zip original et dans cette version. Cet échec n'est donc pas lié aux corrections de stabilité mobile.

## Limite de l'environnement de validation

Le build, le lint, le typecheck complet et les tests Playwright n'ont pas pu être exécutés ici, car les dépendances npm ne sont pas incluses dans le zip et leur téléchargement n'a pas abouti dans l'environnement de validation. Les fichiers modifiés ont toutefois été contrôlés directement avec TypeScript et PostCSS, puis couverts par les suites ciblées ci-dessus.

## Périmètre de l'étape suivante

L'étape 6 sera consacrée uniquement au nettoyage du CSS réellement obsolète. Chaque suppression devra être prouvée, limitée et validée par comparaison avant/après.
