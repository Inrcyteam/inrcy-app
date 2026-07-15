# Booster / Publier — Lot 4 : cache de l'analyse visuelle intermédiaire

## Objectif

Accélérer les régénérations utilisant un moteur sans vision sans modifier le contenu transmis au moteur rédacteur ni les règles de qualité.

## Fonctionnement

- Le cache ne s'applique qu'aux moteurs qui nécessitent une préanalyse visuelle neutre.
- La clé SHA-256 comprend le compte actif, le modèle visuel, la version du prompt visuel, la phrase libre et le contenu exact des images dans leur ordre.
- Le cache stocke uniquement le résumé factuel nettoyé, jamais les images ou vidéos.
- La durée de vie de sécurité est de 6 heures.
- Le premier calcul continue immédiatement après le lancement non bloquant de l'écriture Redis.
- En cas d'absence d'identifiant de compte, de Redis indisponible, de cache absent ou invalide, le comportement antérieur est conservé.

## Qualité inchangée

Le même résumé factuel est réinjecté avec les mêmes règles média. Les prompts de rédaction, la longueur, les emojis, les réparations et les modèles sélectionnés ne sont pas modifiés.

## Invalidation automatique

Aucune invalidation manuelle n'est nécessaire : toute modification du média, de son ordre, de la phrase libre, du modèle visuel ou de la version du prompt produit une nouvelle clé.
