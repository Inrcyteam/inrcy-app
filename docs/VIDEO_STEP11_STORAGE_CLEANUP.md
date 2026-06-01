# Étape vidéo 11 — Nettoyage stockage vidéo

Objectif : éviter que les vidéos source et les variantes générées restent dans le bucket `booster` lorsqu'elles ne sont plus utilisées.

## Ce qui est ajouté

- Route interne `POST /api/booster/video-storage-cleanup`
- Nettoyage best-effort côté Booster quand :
  - une vidéo est retirée du modal ;
  - une vidéo est remplacée par une nouvelle ;
  - la publication en cours est réinitialisée ;
  - des variantes deviennent obsolètes après changement de format/adaptation.

## Sécurité

Le nettoyage ne supprime que les chemins vidéo appartenant à l'utilisateur connecté.
Avant suppression, le serveur vérifie si les fichiers sont encore référencés dans :

- `app_events` / brouillons et historiques Booster ;
- `publications` ;
- `site_articles`.

Si un fichier est encore référencé, il est conservé.

## Résultat attendu

- Remplacer une vidéo ne laisse pas les anciennes variantes inutilisées dans Supabase.
- Retirer une vidéo nettoie la source et les variantes si elles ne sont référencées nulle part.
- Reprendre un brouillon conserve les variantes utiles et ne nettoie pas les fichiers encore liés au brouillon.
