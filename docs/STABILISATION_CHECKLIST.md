# Checklist de stabilisation sans casse

Objectif : sécuriser le socle iNrCy sans modifier le comportement produit.

## Avant toute nouvelle grosse évolution

- [ ] Créer un tag Git ou une sauvegarde nommée de la version stable.
- [ ] Vérifier que le zip de travail ne contient pas `.env`, `.next` ou `node_modules`.
- [ ] Vérifier que les backups Supabase sont actifs.
- [ ] Exporter le schéma Supabase ou confirmer que les migrations sont à jour.
- [ ] Noter les variables Vercel Production / Preview manquantes dans `docs/ENVIRONMENT_CHECKLIST.md`.
- [ ] Garder TikTok / Pinterest / Trustpilot en attente si les accès ne sont pas encore disponibles.

## Commandes de garde-fou

À lancer avant une mise en ligne importante :

```bash
npm ci
npm run typecheck
npm run lint
npm run test:media-rules
npm run test:multicompte
npm run build
```

Si le build local échoue uniquement sur les polices `next/font` à cause du réseau / TLS, vérifier le build Vercel avant de conclure à une erreur applicative.

## Zones à ne pas toucher sans Preview dédiée

- [ ] Refactor des gros fichiers React / API.
- [ ] Accès admin et rôles.
- [ ] CSP stricte.
- [ ] Rate limiting global en fail-closed.
- [ ] OAuth en cours de validation.
- [ ] Règles média multi-canaux.
- [ ] Migrations Supabase non testées.

## Changements autorisés en phase attente plateformes

- [ ] Documentation.
- [ ] Checklists.
- [ ] Correction de textes légaux / wording.
- [ ] Tests ou scripts non utilisés par le runtime.
- [ ] Nettoyage de commentaires morts.
- [ ] Corrections très ciblées avec comparaison avant / après.

## Checklist Preview

- [ ] Connexion utilisateur.
- [ ] Chargement Dashboard.
- [ ] Statuts canaux.
- [ ] Booster / Publier : ouverture modale + aperçu.
- [ ] Mails / iNrSend : ouverture boîte + historique.
- [ ] iNrAgent : dashboard + paramètres + aperçu.
- [ ] E-réputation : liste + détail.
- [ ] Devis / Factures : création brouillon ou aperçu.
- [ ] iNrBadge : affichage fiche publique.

## Checklist Production après déploiement

- [ ] `/api/health` répond 200.
- [ ] `/api/health/internal` répond 200 avec token.
- [ ] Pas de spike 5xx dans Vercel Logs.
- [ ] Pas de nouvelle erreur massive dans Sentry.
- [ ] Connexion réelle OK.
- [ ] Dashboard réel OK.
- [ ] Aucun retour utilisateur bloquant dans les 10 minutes.

## Décision rollback

Rollback si :

- erreur 5xx persistante ;
- dashboard inaccessible ;
- login cassé ;
- callbacks OAuth cassés ;
- envoi mail ou publication bloquante pour plusieurs utilisateurs ;
- migration Supabase problématique.

Préférer un rollback Vercel immédiat si le problème vient du code.
Préférer une migration corrective si le problème vient d'une migration déjà appliquée.
