# iNr'Send - Etape 2 : campagnes intelligentes

## Objectif

Rendre les campagnes de 200 a 300 contacts fiables sans condamner les destinataires lorsqu'une boite Gmail, Outlook ou IMAP/SMTP rencontre un incident temporaire.

## Changements appliques

- Plafond dur de 300 destinataires par campagne, meme si une ancienne variable Vercel contient une valeur superieure.
- Les limites de securite de l'etape 1 ne peuvent plus etre accelerees par erreur : 5 mails par tranche, au moins 8 secondes entre deux mails, au moins 60 secondes entre deux tranches, 150 par heure et 300 sur 24 heures maximum.
- Cle `dispatch_key` unique pour empecher la creation en double d'un meme destinataire dans une campagne.
- Reclamation atomique des destinataires avec `FOR UPDATE SKIP LOCKED`, en complement du verrou par boite de l'etape 1.
- Pause automatique avec `pause_reason` et `resume_at` lorsque le quota iNr'Send ou le fournisseur demande de ralentir.
- Respect de l'en-tete `Retry-After` renvoye par Gmail ou Microsoft lorsqu'il est present.
- Une limitation temporaire globale remet les contacts en file sans consommer inutilement leurs tentatives.
- Une erreur temporaire propre a un destinataire (SMTP 450, 451, 452, boite pleine) est reessayee sans arreter les autres contacts.
- Une adresse invalide ou un refus definitif devient un echec final et peut alimenter la liste de suppression existante.
- Une erreur d'authentification, d'autorisation, de configuration ou un compte bloque met toute la campagne en pause. Les contacts restent en attente et ne sont plus declares en echec.
- Le bouton de l'historique devient `Reprendre la campagne` lorsqu'une action manuelle est necessaire.
- Les statuts et le bilan parlent de messages acceptes par la messagerie d'envoi, sans promettre une livraison finale non verifiee.
- Les donnees d'erreur utiles sont conservees : type d'echec, caractere reessayable et code fournisseur.

## Migration obligatoire

Executer apres la migration de l'etape 1 et avant le deploiement du code :

`ops/sql/2026-07-27_inrsend_step2_intelligent_campaigns.sql`

La migration ajoute les colonnes de pause et de diagnostic, la cle anti-doublon et la fonction de reclamation atomique reservee au `service_role`.

## Configuration de securite effective

```env
CRM_CAMPAIGN_MAX_RECIPIENTS=300
INRSEND_CAMPAIGN_BATCH_SIZE=5
INRSEND_CAMPAIGN_DELAY_MS=8000
INRSEND_CAMPAIGN_BATCH_PAUSE_MS=60000
INRSEND_CAMPAIGN_HOURLY_LIMIT=150
INRSEND_CAMPAIGN_DAILY_LIMIT=300
INRSEND_CAMPAIGN_MAX_ACTIVE_PER_BOX=1
```

Ces variables restent facultatives. Une valeur plus prudente est acceptee, mais une valeur plus agressive est automatiquement ramenee au plafond de securite du code.

## Comportement attendu

- Quota horaire ou journalier : reprise automatique a l'heure calculee.
- Limitation fournisseur : reprise automatique apres `Retry-After` ou le delai de securite.
- Erreur SMTP temporaire d'un contact : nouvel essai de ce contact, poursuite des autres.
- Reconnexion necessaire ou compte bloque : pause sans date, correction de la boite puis bouton `Reprendre la campagne`.
- Fin de campagne : `completed`, `partial` ou `failed` selon les resultats reels enregistres.

## Ordre de deploiement

1. Executer le SQL de l'etape 1 si ce n'est pas deja fait.
2. Executer le SQL de l'etape 2.
3. Deployer le ZIP de l'etape 2.
4. Tester d'abord une campagne de quelques contacts avant un test de volume.
