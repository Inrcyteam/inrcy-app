# iNrCy — Admin V1 — Audit étape 8

## Vérifications effectuées

- Page centrale `/dashboard/admin` présente.
- Pages outils présentes :
  - `/dashboard/admin/commandes`
  - `/dashboard/admin/image-bank`
  - `/dashboard/admin/users`
  - `/dashboard/admin/tools`
  - `/dashboard/admin/diagnostics`
  - `/dashboard/admin/settings`
- Toutes les pages admin vérifient `isAdmin`.
- Les pages admin redirigent vers `/dashboard` si le compte n’est pas admin.
- Les routes `/api/admin/*` sont protégées par :
  - `requireAdminApi()`
  - ou secret serveur/webhook quand la route est appelée par un service externe.
- Les pages admin utilisent un layout `100vh` avec scroll interne sur les listes/tableaux.
- Les pages outils reviennent vers `/dashboard/admin` via le bouton Fermer.
- Le composant placeholder admin ne renvoie plus vers le dashboard.
- La route diagnostics renseigne `resolved_by` avec l’utilisateur admin connecté.
- Le fichier SQL diagnostics est inclus : `ops/sql/2026-06-10_admin_diagnostic_reports.sql`.

## À vérifier après déploiement

- Que `profiles.role = admin` est bien présent sur ton compte.
- Que le bouton Admin apparaît uniquement sur le dashboard admin.
- Que la table `inrcy_diagnostic_reports` est bien créée si tu veux stocker les diagnostics.
- Que le bucket `inrcy-image-bank` existe bien dans Supabase Storage.
- Que les tables `inrcy_image_bank`, `inrcy_image_bank_categories` et `app_bubble_access` existent bien.
- Que les variables Vercel affichées en paramètres système sont bien configurées.

## Note

Le typecheck complet n’a pas été lancé ici car le zip ne contient pas `node_modules`.
