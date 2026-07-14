# iNr’Search — amélioration 2026

Cette version conserve l’identité visuelle orbitale et renforce la valeur SEO, locale et IA de chaque page publique.

## Ce qui a changé

- Mise en cache courte côté serveur et invalidation des routes publiques lors des mises à jour.
- Titres, descriptions, rubriques et textes d’introduction enrichis avec l’activité, les prestations, la ville et les zones réellement déclarées.
- Données structurées enrichies : adresse, téléphone internationalisé, horaires, prestations, FAQ, actualités et fraîcheur de la fiche.
- Les zones d’intervention ne sont plus déduites automatiquement depuis l’adresse : seules les zones confirmées par le professionnel sont publiées.
- Les sections Actualités sans contenu ne sont plus affichées comme si elles étaient alimentées.
- Les médias importants disposent d’alternatives textuelles utiles pour l’accessibilité et la compréhension contextuelle.
- Ajout d’iNr’Guide dans la FAQ : recherche intelligente locale dans les réponses vérifiées, sans hallucination.
- Ajout de `/llms.txt` et de `/entreprises/{slug}/llms.txt` pour fournir aux moteurs de réponse une synthèse factuelle et sourcée.
- IndexNow est relancé après publication, modification ou suppression d’un contenu iNr’Search.
- Pagination des chargements d’annuaire pour éviter la limite silencieuse de 2 000 lignes.
- Le panneau de configuration explique désormais la valeur créée : référencement, moteurs IA, preuves, guide et conversion.

## Garantie graphique

Aucun changement de palette, de mise en scène orbitale, de structure visuelle ou de navigation n’a été introduit. Les ajouts sont intégrés dans les composants existants et les modifications CSS restent limitées aux états techniques et au petit module iNr’Guide.
