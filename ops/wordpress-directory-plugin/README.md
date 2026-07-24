# Plugin iNrCy Annuaire

Ce plugin affiche les profils iNr’Search autorisés dans une page HTML WordPress. Il évite l’iframe : les moteurs reçoivent les intitulés, les descriptions et les liens vers les profils dès le rendu initial. Les cartes sont présentées par 12, avec pagination.

## Installation

1. Déployer d’abord la version iNr’Search qui contient `/api/public/inrsearch/directory`.
2. Dans WordPress : **Extensions → Ajouter une extension → Téléverser une extension**.
3. Installer puis activer `inrcy-directory.zip`.

## Configuration de la purge immédiate

Générer un secret aléatoire d’au moins 32 caractères, puis utiliser exactement la même valeur dans WordPress et dans Vercel.

Dans `wp-config.php`, avant la ligne qui arrête l’édition :

```php
define('INRCY_DIRECTORY_PURGE_SECRET', 'remplacer-par-un-secret-aleatoire-long');
```

Dans les variables d’environnement de l’application :

```text
INRCY_DIRECTORY_PURGE_SECRET=la-même-valeur
INRCY_DIRECTORY_PURGE_URL=https://inrcy.com/wp-json/inrcy/v1/directory-cache/purge
```

`INRCY_DIRECTORY_PURGE_URL` est facultative lorsque l’URL ci-dessus est utilisée, car elle correspond à la valeur par défaut.

Le secret n’est jamais envoyé tel quel : l’application signe le corps et l’horodatage de chaque demande avec HMAC-SHA256. WordPress refuse les signatures incorrectes ainsi que les demandes vieilles de plus de cinq minutes.

## Création de la page

1. Dans **Pages → Ajouter une page**, créer la page `Annuaire iNrCy`.
2. Utiliser le slug `annuaire`.
3. Ajouter un bloc **Code court** contenant :

```text
[inrcy_directory]
```

4. Publier la page.

## Cache

Le plugin appelle :

```text
https://app.inrcy.com/api/public/inrsearch/directory
```

Les filtres transmis sont `q`, `metier`, `secteur`, `ville`, `departement`, `region` et `page`.

Les résultats restent mis en cache cinq minutes côté WordPress pour les performances. Chaque inclusion, exclusion, connexion ou déconnexion iNr’Search incrémente cependant immédiatement la version du cache. Toutes les pages et combinaisons de filtres utilisent alors la nouvelle version sans attendre l’expiration des anciens transients.

Un profil n’est envoyé par l’API que si le professionnel a connecté sa page iNr’Search et autorisé séparément son affichage dans l’annuaire. La page peut donc rester publique et référencée tout en étant absente de l’annuaire.

## Ordre de déploiement

1. Installer cette version `1.2.0` du plugin.
2. Ajouter `INRCY_DIRECTORY_PURGE_SECRET` dans `wp-config.php`.
3. Déployer l’application corrigée avec le même secret dans Vercel.
4. Tester successivement l’inclusion puis l’exclusion d’une fiche.
