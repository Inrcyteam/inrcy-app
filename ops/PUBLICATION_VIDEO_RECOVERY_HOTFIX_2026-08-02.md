# Hotfix publication vidéo — 2 août 2026

## Incident observé

Après le déploiement des caches image/vidéo version 6, le bouton « Vérifier et publier » pouvait s'arrêter après `/api/media-pipeline/workspace/prewarm` sans appeler `/api/booster/publish-now`.

Le parcours validait uniquement les variantes déjà présentes. Une ancienne variante rendue obsolète par le nouveau cache, une source MOV ou une vidéo nécessitant une préparation serveur pouvait donc bloquer la publication avant le dispatch des canaux.

## Correction

- Premier passage rapide : réutilisation d'une variante existante ou publication directe de la source lorsqu'elle est compatible.
- Second passage uniquement si nécessaire : génération automatique de la variante manquante, puis nouvelle validation.
- Même filet de sécurité dans `publish-now` pour les appels directs, asynchrones et programmés.
- Aucun transcodage inutile pour les contraintes de durée qui ne peuvent pas être corrigées sans découper la vidéo.
- Les messages vidéo précis ne sont plus remplacés par l'erreur générique « action non finalisée ».
- Le modèle Claude obsolète visible dans les logs a été remplacé et un 404 bascule immédiatement vers le secours.

## Périmètre inchangé

- Aucun SQL.
- Aucune table, colonne ou règle RLS.
- Aucun scope Meta.
- Aucun connecteur social supprimé.
- Aucun changement de contrat pour la programmation : elle utilise le même moteur `publish-now` et bénéficie du filet de sécurité serveur.

## Validation

- Dashboard : 109/109.
- Publication : 62/62.
- Pipeline média : 97/97.
- iNrSend : 51/51.
- AI Gateway : 168/168.
- Sécurité de contenu Booster : 13/13.
- TypeScript complet : validé.
- ESLint ciblé : validé.
