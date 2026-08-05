# Livraison Booster V3 — 6 août 2026

Cette version repart de la V2 certifiée et ne modifie que les mécanismes directement responsables des régressions observées.

## Corrections de fond

- Les états durables `queued`, `preparing`, `dispatching`, `processing`, `finalizing` et `pending` sont centralisés et toujours affichés comme « en traitement », jamais comme des échecs.
- La préparation et la consommation du workspace sont filtrées par famille média. Une vidéo encore en préparation ne retient plus les canaux configurés avec des images, et inversement.
- Pour les vidéos lourdes, le worker exécute deux missions durables : captures/audio IA en premier, canonique de publication ensuite. L'encodage complet ne peut plus monopoliser le worker avant les captures.
- Un incident d'analyse média reste non bloquant : la génération de texte continue avec la phrase, le profil et le contexte disponible.
- La barre de publication est revenue au composant compact d'origine : une seule barre globale, aucune frise par canal, aucun défilement horizontal et retour à la ligne sur mobile.

## Certification locale

- 544/544 tests Booster, dashboard, publication, iNrSend, Pinterest, iNrAgent et sécurité des contenus.
- 106/106 tests d'architecture et de règles média.
- 105/105 tests TypeScript du pipeline média, dont les vidéos lourdes et l'ordre captures/canonique.
- TypeScript : validé.
- ESLint : validé.
- Build Next.js 16.2.11 : validé, 215 routes/pages collectées.

## Déploiement

1. Conserver les variables d'environnement déjà présentes dans Vercel.
2. Installer avec `npm ci`.
3. Déployer normalement.

Aucune migration SQL supplémentaire n'est nécessaire pour ces corrections.
