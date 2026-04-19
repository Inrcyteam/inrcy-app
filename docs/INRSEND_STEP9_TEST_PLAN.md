# Étape 9 — plan de tests iNr'Send / CRM

## Objectif
Valider en conditions réelles :
- import CRM 100 / 500 / 1000 contacts
- campagnes 100 / 500 / 1000 destinataires
- déduplication import + campagne
- suppressions (opt-out, blacklist, hard bounce, complaint)
- pagination CRM + iNr'Send
- quotas par boîte
- webhooks provider

## Checklist rapide

### 1. Import CRM
- importer un CSV propre de 100 contacts
- importer un CSV avec doublons internes
- réimporter le même CSV
- vérifier le récapitulatif : ajoutés / doublons / existants / invalides

### 2. Campagne simple
- lancer une campagne de 20 destinataires
- vérifier la création campagne + recipients
- vérifier la vue santé de campagne
- vérifier la pagination des destinataires

### 3. Campagne volumineuse
- lancer une campagne de 100 / 500 / 1000
- vérifier le passage en queued / processing / completed
- vérifier les quotas heure / jour
- vérifier qu'une deuxième campagne sur la même boîte reste en attente

### 4. Suppressions
- mettre une adresse en opt-out
- mettre une adresse en blacklist
- simuler un hard bounce
- relancer une campagne et vérifier que ces adresses restent bloquées

### 5. Retry
- forcer quelques échecs temporaires
- relancer les échecs
- vérifier qu'on ne relance pas les non-relançables

### 6. Webhooks
- envoyer un événement delivered
- envoyer un hard bounce
- envoyer un complaint
- vérifier la mise à jour recipient + suppression list
- rejouer le même événement et vérifier l'idempotence

### 7. UX iNr'Send
- vérifier les compteurs de dossiers en haut
- vérifier la pagination bas de liste
- vérifier les vues Mails / Publications / Informations
- vérifier le responsive

## Sortie attendue
À la fin de l'étape 9, noter :
- ce qui passe
- ce qui casse
- ce qui doit être ajusté avant ouverture large
