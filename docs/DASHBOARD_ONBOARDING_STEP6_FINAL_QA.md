# Dashboard onboarding — Étape 6 : sécurisation finale

Cette étape valide le parcours complet et ajoute deux protections finales sans modifier le comportement fonctionnel convenu.

## Protections finales

- Une sauvegarde d'onboarding devenue obsolète après une bascule multicompte ne peut plus réinjecter l'ancien établissement dans l'interface ni déclencher l'ouverture d'un panneau sur le nouvel établissement.
- Sur desktop, Entrée ou Espace sur le cadenas conserve l'info-bulle ouverte. Sur téléphone et tablette, ces touches gardent le comportement d'ouverture/fermeture.

## Couverture validée

- nouveaux comptes et nouveaux établissements multicompte ;
- comptes existants neutralisés par la migration ;
- enchaînement Mon profil → Mon activité → Configuration IA ;
- report du parcours si Profil ou Activité est fermé ;
- Configuration IA non bloquante ;
- verrouillage Booster, iNrAgent, Propulser, Fidéliser, iNrSend et Encaisser ;
- accès conservé au dashboard, aux réglages, à iNrStats, iNrCRM et aux modules autorisés ;
- blocage des clics, raccourcis, paramètres d'URL et URL directes ;
- cadenas au survol sur desktop et au clic en responsive ;
- isolation de l'état et de la complétion par établissement.

## Déploiement

1. Exécuter une seule fois `ops/sql/2026-07-25_dashboard_onboarding_state.sql` dans Supabase.
2. Exécuter facultativement `ops/checks/2026-07-25_dashboard_onboarding_state_check.sql` et vérifier que `accounts_without_onboarding_state` vaut `0`.
3. Déployer l'application.
4. Tester un nouvel établissement multicompte ou un compte de test créé après la migration.

La commande locale complète ajoutée au projet est :

```bash
npm run qa:onboarding
```

## Contrôles exécutés dans cette livraison

- `npm run test:onboarding-state` : 23 tests réussis.
- `npm run qa:multicompte` : audits finaux réussis et 54 tests réussis.
- Transpilation syntaxique TypeScript/TSX : 1 091 fichiers validés.
- Vérification syntaxique JavaScript/MJS/CJS : réussie.

Le téléchargement des dépendances complètes a été interrompu dans l'environnement de génération par des réponses `503` du registre npm interne. Le lint, le typecheck complet et le build doivent donc être rejoués dans le poste local ou la CI avec `npm run qa:onboarding`. Cette limite ne concerne pas une erreur détectée dans le code livré.
