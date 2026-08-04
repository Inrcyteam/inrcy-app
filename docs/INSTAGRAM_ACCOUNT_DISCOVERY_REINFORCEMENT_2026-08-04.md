# Renfort découverte des comptes Instagram - 4 août 2026

## Objectif

Fiabiliser la liste des comptes Instagram professionnels sans modifier les permissions Meta validées, sans demander `business_management` et sans toucher à la publication.

## Comportement conservé

- OAuth Meta standard et Business existants.
- Permissions Instagram/Facebook déjà utilisées.
- Requête historique `/me/accounts` avec `instagram_business_account`.
- Sélection et enregistrement automatiques lorsqu'un seul compte est trouvé.
- Fallbacks Meta déjà présents.

## Renforts ajoutés

1. La requête historique reste prioritaire.
2. Si Meta refuse la requête enrichie ou renvoie zéro Page, iNrCy relance `/me/accounts` avec uniquement `id,name,access_token`.
3. Chaque Page récupérée est ensuite interrogée séparément pour `instagram_business_account`.
4. Les erreurs transitoires Meta 408, 429 et 5xx sont retentées une fois avec timeout.
5. Les erreurs Meta sont structurées côté serveur avec code, sous-code et `fbtrace_id`, sans journaliser les tokens.
6. Une liste vide est maintenant distinguée entre :
   - permissions incomplètes ;
   - aucune Page renvoyée ;
   - Pages trouvées mais aucun Instagram renvoyé ;
   - panne temporaire de découverte Meta.
7. Un bouton `Actualiser les autorisations Meta` lance une réparation OAuth avec `auth_type=rerequest` sans ajouter de permission.

## Hors périmètre volontaire

- Aucun ajout de `business_management`.
- Aucun changement de version Meta.
- Aucun changement des routes de publication Instagram/Facebook.
- Aucun changement SQL ou Supabase.
- Aucun token exposé dans les logs.

## Protection des connexions existantes

- Le déploiement ne supprime et ne réinitialise aucune intégration Instagram existante.
- La route de découverte reste strictement en lecture seule.
- En mode `repair=1`, le callback OAuth conserve `status=connected`, `resource_id`, `resource_label`, la sélection de Page et le token de Page existant.
- Si Meta renvoie un nouveau token de Page valide, il remplace uniquement l'ancien token de Page.
- Si Meta ne parvient pas à confirmer la Page pendant la réparation, l'ancienne sélection reste active au lieu d'être effacée.
- Une connexion normale volontaire conserve le comportement historique de sélection du compte.

## Base de réapplication

- Correctif réappliqué sur `inrcy-app-48-hotfix-publication-performance.zip`.
- Les fichiers Instagram concernés étaient identiques à ceux de la base précédemment renforcée ; la fusion n'écrase donc aucun correctif de performance publication.
