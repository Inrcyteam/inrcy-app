# iNr’Search — intégration finale

## Fonctionnement professionnel

- La bulle iNr’Search reste activée à distance par iNrCy via Bubble Access / Supabase.
- La synchronisation prépare automatiquement la page à partir des informations existantes du profil.
- Le professionnel utilise **Connecter** pour activer sa page publique et son référencement.
- Le bouton devient **Déconnecter** lorsque la page est publiée.
- La déconnexion affiche une alerte et retire la page de l’annuaire et de l’accès public.

## Annuaire public

- Le choix **Ajouter ma page à l’annuaire iNrCy** est séparé de la connexion SEO.
- Une page connectée peut donc rester publique et référencée sans apparaître dans l’annuaire.
- Une page déconnectée ne peut jamais être présentée dans l’annuaire.
- Les profils sont envoyés à WordPress par 12 et les cartes sont paginées.
- Le code postal du profil permet de compléter automatiquement le département et la région.

## Helper

Le bouton **?** explique les sources utilisées par iNr’Search : profil, activité, prestations, zones, médias, publications, contact, référencement et moteurs IA.

## Catalogue interne

Les routes techniques `/entreprises`, `/metiers` et `/secteurs` redirigent vers `https://inrcy.com/annuaire/`. Les fiches individuelles `/entreprises/{slug}` restent publiques uniquement lorsqu’une page est connectée.

## Mise en ligne

1. Déployer l’application sur Vercel comme d’habitude.
2. Remplacer le plugin WordPress par `ops/wordpress-directory-plugin/inrcy-directory.php`.
3. Vérifier la page `https://inrcy.com/annuaire/`.
4. Activer la bulle iNr’Search pour les comptes souhaités depuis Bubble Access / Supabase.
5. Tester un compte avec **Connecter**, puis activer séparément l’annuaire.

Le contrôle TypeScript et le lint ciblé ont été validés. Le build local peut rester bloqué si l’environnement ne parvient pas à télécharger les polices Google déjà utilisées par le projet.
