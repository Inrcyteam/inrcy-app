# Correctif TUS signé Supabase — 30 juillet 2026

## Cause racine

Les fichiers supérieurs à 6 Mo utilisaient un token créé par `createSignedUploadUrl`,
mais initialisaient TUS sur `/storage/v1/upload/resumable`. Le transport signé doit
utiliser `/storage/v1/upload/resumable/sign`. Le premier bloc de 6 Mo pouvait alors
sembler progresser avant l'échec des requêtes suivantes.

## Correctifs fusionnés

- endpoint direct Storage signé `/storage/v1/upload/resumable/sign` ;
- en-tête public `apikey` sur POST, HEAD et PATCH ;
- maintien du token temporaire `x-signature` sur POST, HEAD et PATCH ;
- chunks TUS de 6 Mo et reprise depuis l'offset réel du serveur ;
- invalidation automatique des reprises locales créées avec l'ancien endpoint ;
- erreurs HTTP Supabase réelles remontées sans délai pour les erreurs définitives ;
- confirmation obligatoire du statut `uploaded` dans le registre ;
- relance de la préparation image/vidéo et filet de sécurité du workspace conservés ;
- échec d'upload propagé immédiatement à Générer au lieu d'attendre le polling serveur.

## Déploiement

Aucun SQL, aucune nouvelle variable Vercel et aucun changement de flag. La variable
existante `NEXT_PUBLIC_SUPABASE_ANON_KEY` fournit la clé publique requise.
