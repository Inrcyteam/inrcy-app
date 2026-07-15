# Booster / Publier — Lot 1 : contexte de génération préchargé

## Objectif

Réduire le travail effectué au clic sur « Générer avec iNrCy » sans modifier les prompts, les médias, les exigences de longueur, les emojis ou les contrôles qualité.

## Changements

- Préchargement silencieux du contexte dès l’ouverture de Booster / Publier.
- Cache serveur Upstash séparé pour le profil/activité et les cinq publications récentes.
- Lectures Supabase parallélisées lorsque le cache est absent.
- Chargement du contexte en parallèle de la réservation des crédits IA.
- Invalidation du cache professionnel après sauvegarde du profil, de l’activité, de la configuration IA ou des préférences.
- Invalidation de la mémoire éditoriale après création d’une publication.
- Rechargement automatique du contexte après une modification de Configuration IA dans la modale Booster.

## Sécurité et continuité

- Le navigateur ne transmet jamais le contenu du profil mis en cache au moteur.
- Les clés sont isolées par établissement actif (`activeUserId`).
- Redis reste une optimisation facultative.
- En cas de cache absent, désactivé ou indisponible, Supabase reste la source de vérité et la génération continue avec le comportement existant.
- Durées de sécurité : 24 h pour le contexte professionnel et 6 h pour les publications récentes, avec invalidation explicite avant expiration.

## Observabilité

Les logs existants de `/api/booster/generate` incluent maintenant :

- `contextLoadMs`
- `professionalContextSource`
- `publicationsContextSource`

Les sources possibles sont `hit`, `database` et `disabled`.
