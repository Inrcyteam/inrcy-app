# Dashboard — stabilité immédiate de Site iNrCy au retour

## Problème corrigé

À la réouverture du dashboard, la bulle Site iNrCy pouvait brièvement apparaître désactivée pendant que l'accès Supabase, le lien du site et les connexions GA4 / Search Console étaient relus. Cette phase transitoire pouvait aussi faire afficher une puissance inférieure à 100 % et « 2 étapes restantes ».

## Comportement retenu

- la dernière apparence confirmée de Site iNrCy est restaurée immédiatement depuis le cache du compte actif ;
- la dernière puissance confirmée reste affichée tant que la vérification serveur n'est pas terminée ;
- les états transitoires ne sont plus enregistrés comme de nouveaux états confirmés ;
- à la réponse de Supabase, l'interface adopte l'état réellement autorisé et actualise les caches.

## Sécurité préservée

Le cache est uniquement utilisé pour la continuité visuelle :

- il ne déverrouille jamais le bouton Configurer ;
- il ne rend jamais le lien Voir accessible ;
- il ne remplace jamais la vérification `app_bubble_access` ;
- si l'API d'accès échoue, les actions restent verrouillées en mode fail-closed.

Ainsi, un compte sans activation explicite de Site iNrCy ne peut pas obtenir l'accès par le navigateur, tandis qu'un compte déjà validé ne subit plus de clignotement visuel au chargement.
