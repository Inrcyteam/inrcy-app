# Patch notes – mars 2026

Ce patch corrige les points de code identifiés pendant l'audit qui pouvaient bloquer une commercialisation à plus grande échelle.

## Corrigé dans le code

1. **Résolution de domaine des widgets**
   - avant : scan limité à 200 lignes sur `pro_tools_configs`
   - maintenant :
     - lookup prioritaire dans `widget_domain_registry`
     - fallback paginé pour éviter les faux négatifs
     - auto-remplissage du registre au premier hit réussi

2. **Rate limit public distribué sur les widgets**
   - avant : `Map()` mémoire locale dans `/api/widgets/actus`
   - maintenant : Upstash via `lib/rateLimit.ts`
   - ajouté aussi sur `/embed/actus`

3. **Vérification d'environnement renforcée**
   - `scripts/verify-env.mjs` vérifie désormais aussi :
     - admin secret
     - secret widget
     - SMTP
     - Stripe
     - URL app
     - principaux paramètres OAuth recommandés

4. **SQL Supabase fourni**
   - `sql/2026-03-widget-domain-registry.sql`
   - crée la table de registre + index + triggers + backfill

## À faire manuellement hors code

1. **Exécuter le SQL Supabase**
2. **Déployer le zip patché**
3. **Valider les limites Auth / Email dans Supabase**
4. **Vérifier Sentry après redéploiement**
   - login
   - Facebook / Instagram
   - dashboard initial

## Important

Ce patch ne peut pas corriger automatiquement :
- les limites configurées dans la console Supabase Auth
- les problèmes Sentry non reproductibles sans exécution réelle en prod
- les secrets / variables d'environnement manquants dans Vercel
