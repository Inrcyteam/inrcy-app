# Meta Insights v25 — migration Media Views / Media Viewers

Date : 2026-08-02

## Changement

- `page_impressions` -> `page_media_view`
- `page_impressions_unique` -> `page_total_media_view_unique`
- `post_impressions` -> `post_media_view`
- `post_impressions_unique` -> `post_total_media_view_unique`
- Les anciennes clés restent uniquement dans les lecteurs iNrStats pour afficher l'historique déjà enregistré.
- Les requêtes post utilisent une requête groupée rapide avec découpage automatique seulement si Meta refuse une métrique pendant un rollout.

## Permissions

Aucun scope ajouté ou supprimé :

- `pages_show_list`
- `pages_manage_posts`
- `pages_read_engagement`
- `read_insights`

Aucune nouvelle validation Meta attendue tant que ces permissions disposent déjà de l'accès avancé en production. Aucun reconnect utilisateur requis.
