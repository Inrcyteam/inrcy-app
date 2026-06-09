# Diagnostic connexion iNrCy

Ajout isolé de la page `/diagnostic` et des routes `/api/diagnostic/*`.

Objectif : aider un client bloqué sur la page de connexion sans toucher au client Supabase principal, aux règles RLS, au proxy global, au stockage ou aux routes existantes de l'application.

Tests effectués côté navigateur :

- navigateur et état en ligne déclaré ;
- localStorage ;
- sessionStorage ;
- cookies first-party iNrCy ;
- appel simple à `/api/diagnostic/ping` ;
- chargement d'une ressource publique iNrCy.

Depuis la page login, le bouton « Diagnostiquer l'erreur » ouvre `/diagnostic?from=login&reason=...&auto=1`. Dans ce cas, le rapport est envoyé automatiquement à `contact@inrcy.com` via `TX_SMTP_*`.

Aucune requête Supabase directe ou proxy Supabase n'est ajoutée par ce diagnostic.
