# Plugin iNrCy Annuaire

Ce plugin affiche les profils iNrSearch autorisés dans une vraie page HTML WordPress. Il évite l’iframe : les moteurs reçoivent les intitulés, les descriptions et les liens vers les profils dès le rendu initial. Les cartes sont présentées par 12, avec pagination.

## Installation

1. Déployer d’abord la version iNrSearch qui contient `/api/public/inrsearch/directory`.
2. Compresser le fichier `inrcy-directory.php` dans un ZIP nommé `inrcy-directory.zip`.
3. Dans WordPress : **Extensions → Ajouter une extension → Téléverser une extension**.
4. Installer puis activer **iNrCy Annuaire**.

## Création de la page

1. Dans **Pages → Ajouter une page**, créer la page `Annuaire iNrCy`.
2. Utiliser le slug `annuaire`.
3. Ajouter un bloc **Code court** contenant :

```text
[inrcy_directory]
```

4. Laisser la page en brouillon pour la prévisualiser.
5. Une fois la route iNrSearch déployée et les profils visibles, publier la page.
6. Ajouter `Annuaire` au menu principal et envoyer la page dans Rank Math via **Indexation instantanée**.

## Contrat appelé

Le plugin appelle :

```text
https://app.inrcy.com/api/public/inrsearch/directory
```

Les filtres transmis sont `q`, `metier`, `secteur`, `ville`, `departement`, `region` et `page`. Les résultats sont mis en cache cinq minutes côté WordPress.

Un profil n’est envoyé par l’API que si le professionnel a connecté sa page iNr’Search et autorisé séparément son affichage dans l’annuaire. La page peut donc rester publique et référencée tout en étant absente de l’annuaire.
