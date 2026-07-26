# iNrBadge - suppression du faux statut Connecté au rafraîchissement

## Cause

Au premier rendu du Dashboard, le contrôle Supabase de complétude de « Mon profil » n'avait pas encore répondu.
L'état initial `profileIncomplete = false` était interprété de manière optimiste comme un profil complet :

```ts
cachedInrBadgeProfileReady ?? !profileIncomplete
```

La bulle affichait donc brièvement `Connecté`, puis le contrôle réel remplaçait cet état par le verrou.

## Correction

- iNrBadge est maintenant **fail-closed** : il ne peut être connecté que si le contrôle profil est terminé et positif.
- Pendant le contrôle, le statut affiche `Synchronisation…`.
- Les actions `Voir mon badge` et `Configurer` restent indisponibles jusqu'à la fin du contrôle.
- Le cache d'un ancien rendu n'est plus utilisé pour accorder visuellement l'état connecté.

Condition autoritative :

```ts
profileCheckReady && !profileIncomplete
```

## Validation

Suite ciblée onboarding : 34 tests réussis.
