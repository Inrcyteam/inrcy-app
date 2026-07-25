# Dashboard onboarding — Étape 4 : verrouillage Profil + Activité

Cette étape centralise le verrouillage des outils qui dépendent de la configuration métier.

## Outils protégés

- Booster / Publier, y compris ses ouvertures par paramètres d'URL et brouillons
- iNrAgent
- Propulser
- Fidéliser
- iNrSend
- Encaisser, factures et devis

## Outils et surfaces qui restent accessibles

- Dashboard
- Bulles et réglages
- Mon profil
- Mon activité
- Configuration IA
- iNrStats
- iNrCRM
- iNrCalendar, médiathèque, GPS et e-réputation

## Sécurités

- Le verrouillage s'applique aux clics du dashboard et du bandeau responsive.
- Une URL directe vers un outil protégé est interceptée dans le layout puis renvoyée vers `/dashboard`.
- L'accès échoue de manière fermée tant que la vérification de complétion n'est pas terminée.
- L'état de complétion est synchronisé entre le dashboard, le garde de route et la navigation responsive.
- La synchronisation reste isolée par établissement et ignore les réponses devenues obsolètes lors d'un nouvel enregistrement.

Aucun cadenas ni message visuel n'est ajouté dans cette étape. Ils appartiennent à l'étape 5.

Le contrôle est doublé côté serveur pour les pages protégées et les ouvertures du Booster/Encaisser par paramètres d'URL. Le garde client reste présent pour les transitions rapides, les raccourcis et les changements d'établissement sans rechargement complet.
