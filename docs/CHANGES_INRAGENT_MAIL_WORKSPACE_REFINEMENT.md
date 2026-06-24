# Correctif iNrAgent — workspace mail Propulser/Fidéliser

## Objectif
Renforcer le workspace de validation iNrAgent pour que les campagnes automatiques Propulser et Fidéliser puissent être contrôlées et ajustées sans ouvrir iNrCRM ou iNrSend.

## Changements fonctionnels

### Boîte d’envoi
- Ajout d’une icône œil sur la carte Boîte d’envoi.
- La carte Boîte d’envoi ouvre directement la modale interne de choix de boîte mail.
- L’adresse email réelle est affichée en priorité, au lieu du fournisseur seul (`gmail`, `microsoft`, etc.).
- Le fournisseur reste affiché en information secondaire dans la modale.

### Destinataires
- La modale de modification des destinataires reprend une logique proche de iNrSend.
- Ajout d’un champ libre pour ajouter des emails manuellement.
- Ajout de boutons Tout / Aucun sur les contacts CRM affichés.
- Ajout des filtres CRM : catégorie, type, département, important uniquement.
- Tout / Aucun agit sur les résultats filtrés, comme dans iNrSend.
- Les destinataires manuels peuvent être ajoutés à la campagne sans obligatoirement créer un contact CRM.
- Le bouton d’ajout au CRM reste disponible pour créer un contact et le sélectionner.

### Propulser / Fidéliser
- Les corrections s’appliquent au workspace commun des campagnes automatiques Propulser et Fidéliser dans iNrAgent.

## Fichiers modifiés
- `app/dashboard/agent/AgentClient.tsx`
- `app/dashboard/agent/agent.module.css`
- `app/api/agent/actions/route.ts`
- `app/api/agent/actions/prepare-campaign/route.ts`
- `app/api/integrations/status/route.ts`

## SQL
Aucun SQL nécessaire.
