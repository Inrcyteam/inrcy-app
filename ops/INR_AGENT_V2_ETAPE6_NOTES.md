# iNr'Agent V2 — Étape 6

## Objectif
Brancher iNr'Agent aux campagnes mails Propulser et Fidéliser, en conservant la règle métier : l'agent prépare la campagne, affiche l'aperçu et les destinataires CRM, puis le pro valide avant exécution.

## Changements effectués

### 1. Nouvelle préparation de campagne
Ajout de la route :

- `POST /api/agent/actions/prepare-campaign`

Elle accepte :

```json
{ "automationKey": "grow" }
```

ou

```json
{ "automationKey": "loyalty" }
```

### 2. Propulser
Pour `grow`, iNr'Agent :

- choisit un thème autorisé parmi `Valoriser`, `Récolter`, `Offrir`
- récupère un template d'origine via la banque existante `getTemplates`
- appelle l'IA existante `/api/templates/generate-ai`
- récupère la boîte mail connectée
- récupère les destinataires CRM selon le scope paramétré
- crée une action `inr_agent_actions` avec le payload complet

Mapping utilisé :

- `Valoriser` → template action `valoriser`, track type `valorize`
- `Récolter` → template action `avis`, track type `review_mail`
- `Offrir` → template action `offres`, track type `promo_mail`

### 3. Fidéliser
Pour `loyalty`, iNr'Agent :

- choisit un thème autorisé parmi `Informer`, `Enquêter`, `Suivre`
- récupère un template d'origine via `getTemplates`
- appelle l'IA existante `/api/templates/generate-ai`
- récupère les destinataires CRM, par défaut les clients
- crée une action préparée avec aperçu et destinataires

Mapping utilisé :

- `Informer` → template action `informations`, track type `newsletter_mail`
- `Enquêter` → template action `enquetes`, track type `satisfaction_mail`
- `Suivre` → template action `suivis`, track type `thanks_mail`

### 4. Exécution réelle après validation
La route existante :

- `POST /api/agent/actions/execute`

sait maintenant exécuter aussi les campagnes Propulser / Fidéliser.

Quand le pro clique sur **Valider**, iNr'Agent :

- passe l'action en `executing`
- appelle le moteur existant `/api/crm/campaigns`
- crée la campagne mail avec la boîte connectée
- enfile les destinataires CRM
- lance le traitement immédiat si le moteur mail est disponible
- passe l'action en `completed` ou `failed`
- stocke le résultat dans `payload.execution`

### 5. UI iNr'Agent
Dans `/dashboard/agent` :

- ajout du bouton **Préparer une campagne Propulser**
- ajout du bouton **Préparer une campagne Fidéliser**
- affichage du nombre de destinataires CRM dans l'aperçu
- le bouton **Valider** affiche un message adapté aux campagnes mails

## Points importants

- Aucune campagne n'est envoyée sans validation du pro.
- Une boîte mail connectée est obligatoire.
- Les campagnes mails n'obligent pas l'image.
- Les destinataires viennent du CRM : tout CRM pour Propulser, clients pour Fidéliser par défaut.
- Aucun nouveau SQL n'est nécessaire si le SQL de l'étape 1 a déjà été exécuté.
