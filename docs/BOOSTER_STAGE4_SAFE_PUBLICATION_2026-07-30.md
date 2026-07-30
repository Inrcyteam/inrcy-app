# Booster — Étape 4 : publication sécurisée

Date : 30 juillet 2026

## Correctifs

- Chaque publication manuelle reçoit une clé d'idempotence unique.
- Une réponse mobile perdue ou un 502/503/504 est retenté avec la même clé, sans créer un second envoi volontaire.
- Les erreurs réseau finales indiquent que l'envoi peut encore être actif et demandent de vérifier iNr'Send avant toute relance.
- Le bilan serveur expose maintenant le statut et le caractère relançable de chaque canal.
- En cas de succès partiel, le workspace média reste disponible.
- La modale de résultat permet de relancer uniquement les canaux réellement en échec et relançables.
- Le workspace n'est archivé et l'éditeur n'est fermé qu'après succès complet.
- Le bouton Publier du dock mobile est désactivé à partir de l'état réel de la modale, avec un secours visuel `:disabled`, indépendamment de la mise à jour de l'URL sur certains Google Pixel / WebView Android.

## Déploiement

- Aucun nouveau SQL.
- Aucune nouvelle variable d'environnement.
- La table d'idempotence existante reste utilisée avec un repli sans blocage si elle est indisponible.

## Vérifications

- TypeScript.
- ESLint ciblé.
- Tests Dashboard.
- Tests iNr'Send.
- Tests TikTok étape 3.
- Tests sécurité de contenu Booster.
- 93 tests du pipeline média.
