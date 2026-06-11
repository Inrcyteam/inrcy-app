# iNr'Agent V2 — Étape 1

Objectif de cette étape : préparer une structure Supabase solide avant de brancher le moteur iNr'Agent aux outils.

## Ce qui a été ajouté

### 1. Réglages globaux
Table : `inr_agent_settings`

Elle garde les infos communes :
- activation globale de l'agent
- ton de communication
- fuseau horaire
- métadonnées

### 2. Réglages par automatisation
Nouvelle table : `inr_agent_automation_settings`

Une ligne par famille :
- `publish` = Publier régulièrement
- `grow` = Développer l’activité / Propulser
- `loyalty` = Fidéliser les contacts
- `stats` = Analyser les statistiques

Chaque automatisation peut avoir ses propres réglages : fréquence, jour, heure, mode de validation, canaux, thèmes, banque d'images, destinataires CRM, prochaine exécution.

### 3. Actions préparées plus puissantes
Table : `inr_agent_actions`

Elle accepte maintenant un vrai `payload jsonb`, pour stocker les futures données exécutables :
- contenus par canal
- image sélectionnée
- campagne mail
- destinataires CRM
- bilan PDF stats
- statut de validation / exécution

## Script Supabase à lancer

Le script complet à exécuter est :

`ops/SUPABASE_INR_AGENT_V2.sql`

Il contient les réglages + les actions et il est compatible avec les anciennes tables V1.

## Prochaine étape logique

Étape 2 : brancher la page `/dashboard/agent` aux vrais réglages Supabase au lieu des réglages locaux en `useState`.
