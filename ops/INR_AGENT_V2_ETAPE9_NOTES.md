# iNr'Agent V2 — Étape 9

Objectif : ne pas créer d'historique iNr'Agent séparé. iNr'Send reste la mémoire centrale de toutes les communications.

## Fait

- Publications Booster générées par iNr'Agent :
  - conservation de l'origine dans `app_events.payload.origin`.
  - iNr'Send lit cette origine depuis `payload.origin`.

- Campagnes Propulser / Fidéliser générées par iNr'Agent :
  - transmission d'une `metadata` depuis `/api/agent/actions/execute` vers `/api/crm/campaigns`.
  - stockage dans `mail_campaigns.metadata`.
  - iNr'Send lit cette origine depuis `metadata.source`.

- Interface iNr'Send :
  - petite icône 🤖 dans la colonne `Détails`, à côté du bouton d'ouverture.
  - date recentrée pour rester alignée avec le titre de colonne `Date`.

## SQL à lancer

Lancer :

```sql
ops/SUPABASE_INR_AGENT_ETAPE9_INRSEND_ORIGIN.sql
```

## Comportement attendu

- Une publication validée depuis iNr'Agent apparaît dans `iNr'Send > Publications` avec l'icône 🤖.
- Une campagne Propulser validée depuis iNr'Agent apparaît dans `iNr'Send > Propulsions` avec l'icône 🤖.
- Une campagne Fidéliser validée depuis iNr'Agent apparaît dans `iNr'Send > Fidélisations` avec l'icône 🤖.
- Les communications manuelles restent inchangées.
