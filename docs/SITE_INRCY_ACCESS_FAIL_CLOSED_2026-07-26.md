# Site iNrCy — accès Supabase en mode fail-closed

## Règle

La bulle `site_inrcy` n'est accessible que si la ligne `app_bubble_access` du compte actif contient `enabled = true`.

## Correctifs

- valeur par défaut `site_inrcy = false` ;
- une ligne manquante est créée à `false` par `/api/bubble-access/ensure` ;
- le cache navigateur ne peut plus accorder cet accès avant la réponse de Supabase ;
- si l'API d'accès échoue, l'interface reste verrouillée ;
- TikTok reste toujours actif et Pinterest reste désactivé par défaut.

## Effet UI

Sans activation Supabase, la bulle affiche `Désactivé` et le bouton `Configurer` reste indisponible. Une ligne explicite `enabled = true` réactive immédiatement la bulle après rechargement.

## Continuité visuelle au chargement — 30 juillet 2026

Le dernier état confirmé peut désormais être réaffiché pendant la vérification Supabase afin d'éviter un flash « Désactivé » et une baisse temporaire de la puissance du Générateur. Cette restauration est strictement visuelle : les actions, liens et panneaux restent verrouillés jusqu'à la réponse autoritative de `/api/bubble-access/ensure`.
