# Annuaire iNrCy — intégration

Cette version de l’application contient la connexion entre iNrSearch et la page Annuaire de `inrcy.com`.

## Ce qui a été ajouté

- une API publique à l’adresse `/api/public/inrsearch/directory` ;
- la recherche par entreprise, métier, secteur, ville, département et région ;
- la pagination, les facettes et le cache ;
- uniquement les profils iNrSearch publiés et éligibles ;
- des liens vers les pages publiques `/entreprises/{slug}` ;
- le pont WordPress dans `ops/wordpress-directory-plugin/`.

## Mise en ligne

Déployer cette application comme d’habitude sur l’hébergement iNrSearch. Après le déploiement, vérifier cette adresse :

`https://app.inrcy.com/api/public/inrsearch/directory`

Elle doit répondre avec un JSON contenant `"ok": true`.

Dans WordPress, la page « Annuaire iNrCy » et le shortcode `[inrcy_directory]` sont déjà préparés. Ne pas installer simultanément le plugin et l’extrait Code Snippets : une seule des deux méthodes doit être active.
