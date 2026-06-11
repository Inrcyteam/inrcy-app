# iNr'Agent V2 — Étape 10

Objectif : audit final, garde-fous visibles et sécurisation pour ne pas casser les parcours manuels existants.

## Fait

- Ajout d'un rappel visible dans iNr'Agent :
  - les publications et campagnes restent soumises à validation,
  - les bilans stats partent uniquement au pro,
  - l'historique reste centralisé dans iNr'Send.

- Mise à jour du helper iNr'Agent :
  - précision que les communications exécutées restent dans iNr'Send,
  - pastille iNr'Agent affichée seulement quand l'action vient de l'automatisation.

- Sécurisation iNr'Send / Propulser / Fidéliser :
  - si le SQL étape 9 n'a pas encore été lancé et que `mail_campaigns.metadata` n'existe pas, la création de campagne retente automatiquement sans `metadata`.
  - cela protège les campagnes manuelles existantes en attendant le passage SQL.
  - l'icône iNr'Agent sur les campagnes apparaîtra dès que la colonne `metadata` existe.

- Sécurisation lecture iNr'Send :
  - les campagnes sont relues de façon compatible même si la colonne `metadata` n'existe pas encore.

- Nettoyage mineur :
  - suppression d'un doublon inutile dans la normalisation des destinataires de campagne iNr'Agent.

## À tester après déploiement

1. Publication manuelle Booster → doit apparaître dans iNr'Send sans icône iNr'Agent.
2. Publication préparée par iNr'Agent → Valider → doit apparaître dans iNr'Send avec icône iNr'Agent.
3. Campagne Propulser manuelle → doit apparaître sans icône iNr'Agent.
4. Campagne Propulser iNr'Agent → Valider → doit apparaître avec icône iNr'Agent si le SQL étape 9 est lancé.
5. Campagne Fidéliser manuelle → doit apparaître sans icône iNr'Agent.
6. Campagne Fidéliser iNr'Agent → Valider → doit apparaître avec icône iNr'Agent si le SQL étape 9 est lancé.
7. Bilan stats PDF → doit être envoyé au pro, sans demande de validation.
8. Cron `/api/cron/inr-agent?dryRun=1&secret=...` → doit lister les automatisations sans créer de doublons.

## SQL

Pas de nouveau SQL pour l'étape 10.

Le SQL de l'étape 9 reste recommandé pour afficher la pastille iNr'Agent sur les campagnes Propulser / Fidéliser :

```sql
ops/SUPABASE_INR_AGENT_ETAPE9_INRSEND_ORIGIN.sql
```
