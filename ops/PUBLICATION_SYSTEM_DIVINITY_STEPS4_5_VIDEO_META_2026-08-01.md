# Système de publication — Étapes 4 et 5 — Vidéo globale + Meta

Date : 2026-08-01

## Étape 4 — Politique vidéo globale harmonisée

- La source produit reste acceptée jusqu'à 300 Mio.
- Le canonique commun garde uniquement 1 Mio de marge technique, soit 299 Mio.
- Aucun plafond global artificiel à 40 Mio n'est réintroduit.
- Une source de 300 Mio compressée à 220 Mio reste publiable sur tous les canaux dont les contraintes l'acceptent.
- Google Business conserve sa variante dédiée à 72 000 000 octets maximum.
- Une source H.264/AAC déjà compatible utilise le chemin rapide de remux sans recompression destructive.
- Le SQL historique de durcissement a été aligné sur le plafond canonique réel de 299 Mio.

## Étape 5 — Meta centralisé

- Facebook, Instagram, OAuth, assets, statistiques et iNrSend utilisent un contrat unique.
- Version par défaut : `v25.0`.
- Rollback serveur immédiat possible avec `META_GRAPH_API_VERSION=v24.0`.
- La valeur de rollback est validée par une expression stricte avant d'être injectée dans une URL.
- Les permissions OAuth et les produits Meta existants ne sont pas modifiés.
- Aucun nouvel accès ni nouvelle permission n'est demandé par ce correctif.

## Contrôles

- audit étape 4 ;
- tests étape 4 ;
- audit étape 5 ;
- tests étape 5 ;
- reprise intégrale des certifications étapes 1 à 3 ;
- dashboard, Booster images, média, iNrSend, TypeScript et lint ciblé.

## Certification obtenue

- Étape 4 : 7/7 contrôles et 6/6 tests.
- Étape 5 : 6/6 contrôles et 5/5 tests.
- Étapes 1 à 3 : certification cumulative conservée.
- Politique vidéo et anciens garde-fous : 12/12 tests.
- Durcissement média étape 10 : 13/13 tests.
- Dashboard : 109/109 tests.
- iNrSend : suite complète sans échec.
- TypeScript complet : aucune erreur.
- Lint de tous les fichiers modifiés : aucune erreur et aucun avertissement.
- Le lint global a dépassé la fenêtre d'exécution de l'environnement d'audit.
- Le build Next n'a pas pu charger SWC Linux depuis les dépendances d'audit existantes ; aucune erreur TypeScript ou applicative n'a été détectée.
