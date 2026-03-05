# Registre des traitements (RGPD) — iNrCy

> Document interne (à conserver à jour). Basé sur les fonctionnalités actuelles de l’application.

## Responsable du traitement

- **Société** : iNrCy (SAS)
- **Contact RGPD** : contact@inrcy.com
- **Adresse** : 1 rue de Fouquières — 62440 Harnes — France

## Sous-traitants (à compléter avec les liens DPA)

- Supabase (auth + base de données)
- Vercel (hébergement)
- Stripe (paiement)
- Upstash (rate limiting / KV)
- Google (OAuth + APIs GA/GSC/Business/Stats)
- Microsoft (OAuth + APIs)
- Facebook (OAuth + APIs)
- Fournisseur email (SMTP/IMAP) selon comptes connectés

## Tableau de registre (modèle)

| Traitement | Finalité | Catégories de données | Personnes concernées | Base légale | Durée de conservation | Destinataires / Sous-traitants | Mesures de sécurité |
|---|---|---|---|---|---|---|---|
| Comptes utilisateurs | Créer et gérer un compte iNrCy | email, identifiant, métadonnées compte | Pros utilisateurs | Contrat | Durée du compte + 30j | Supabase, Vercel | Auth Supabase, contrôles d’accès |
| Profil entreprise | Personnaliser les communications | infos entreprise, zones, horaires | Pros utilisateurs | Contrat | Durée du compte | Supabase | RLS, chiffrement transit |
| Connexions OAuth (GA/GSC/…) | Permettre l’accès aux APIs tiers | tokens OAuth (chiffrés/stockés côté serveur), identifiants intégrations | Pros utilisateurs | Contrat | Durée de l’intégration | Google/Microsoft/Facebook | Scope minimal, rotation, accès serveur |
| CRM Contacts | Gérer les contacts/clients | noms, téléphones, emails, historique | Contacts du pro | Intérêt légitime / Contrat pro-client | Selon paramétrage, recommandé 3 ans | Supabase | RLS, limitation accès |
| Agenda | Planning interventions | événements, notes | Pros utilisateurs | Contrat | Durée du compte | Supabase | RLS |
| Paiements | Abonnement | infos facture, IDs Stripe | Pros utilisateurs | Contrat / Obligation légale | 10 ans (facturation) | Stripe | Stripe PCI, accès restreint |
| Logs techniques | Sécurité + debug | request_id, route, statut, (IP si nécessaire) | Utilisateurs | Intérêt légitime | 30 jours (reco) | Vercel/Sentry (si activé) | accès restreint, purge |

## Notes de conformité

- Les **données de paiement** ne doivent pas être stockées côté iNrCy (Stripe uniquement).
- Les **scopes OAuth** doivent être les plus minimaux possibles.
- Prévoir une procédure interne :
  - demandes d’accès / rectification / suppression
  - violation de données (notification)
