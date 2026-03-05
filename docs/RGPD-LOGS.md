# Logs & RGPD — recommandations iNrCy

Objectif : conserver des logs utiles (sécurité/debug) **sans** stocker inutilement des données personnelles.

## À ne jamais logger

- tokens OAuth (access/refresh)
- cookies (dont cookie Supabase)
- mots de passe
- secrets API

## Minimisation

- privilégier `user_id` plutôt que `email`
- éviter l’IP si non nécessaire
- ne pas logger le body complet des requêtes

## Durée de conservation (recommandation)

- logs applicatifs/debug : **30 jours**
- logs sécurité/abuse : **3 à 6 mois** selon le besoin

## Accès

- accès restreint (admin/tech)
- journalisation de l’accès si possible (Sentry / plateforme)

## Mise en œuvre dans ce repo

- `lib/observability/logger.ts` filtre automatiquement certaines clés sensibles (`token`, `cookie`, `authorization`, etc.).
- Pour la rétention, configurer la plateforme (Vercel / Log drain / Sentry) selon la politique interne.
