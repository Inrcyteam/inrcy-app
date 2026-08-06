# Bilan final — Booster vidéo 75 Mo sans compression

## Résultat livré

Le Booster revient à un circuit simple et unique :

- jusqu’à 5 images, 50 Mo chacune et 150 Mo au total ;
- une seule vidéo, de 75 000 000 octets maximum ;
- formats vidéo communs conservés : MP4, M4V ou MOV, avec vidéo H.264 et audio AAC ;
- au-delà de 75 Mo, le fichier est refusé avant l’upload avec une consigne claire pour le compresser hors du Booster ;
- aucune distinction « vidéo légère / vidéo lourde » ;
- aucune compression automatique dans la génération, la publication ou Google Business ;
- le fichier original accepté est la référence de la génération et de la publication.

## Génération

- L’ajout d’une vidéo lance immédiatement sa préparation technique en arrière-plan.
- La préparation ne fabrique plus de vidéo canonique ni de copie compressée.
- Le worker ne produit que les éléments réellement utiles à l’IA : miniature, trois captures et piste audio.
- Les captures IA sont extraites directement de l’original accepté.
- Le clic sur « Générer » n’est pas bloqué indéfiniment par les captures : l’attente est bornée et la génération peut continuer avec le sujet et le profil si l’analyse visuelle n’est pas encore disponible.
- Les anciennes variantes `canonical` et `ai_preview` restent seulement lisibles pour ne pas casser les anciens brouillons ; elles ne sont plus créées par le nouveau flux vidéo.

## Publication

- La publication consomme directement l’original validé, sans seconde compression.
- Les adaptations explicites demandées manuellement par le professionnel restent possibles par canal.
- Les validations de durée, résolution, codec et format sont conservées par canal pour éviter d’envoyer un binaire que le fournisseur refusera.
- Google Business utilise le même plafond de 75 000 000 octets et ne déclenche aucune compression liée au poids. Ses règles de 30 secondes maximum et de résolution minimale 720p restent vérifiées.
- Le lancement durable répond rapidement, puis les canaux plus lents terminent en arrière-plan avec un statut individuel.
- Les erreurs Facebook, Instagram, TikTok, YouTube, Pinterest et Google Business sont isolées par canal : un échec ne transforme plus toute la publication en blocage global.
- Le chemin TikTok photo est distingué explicitement du chemin vidéo afin qu’une publication d’images ne soit plus envoyée comme une vidéo.

## Affichage et suivi

- Le texte universel de progression est « Préparation des médias ».
- Aucun libellé « Compression des médias » ne reste dans le parcours actif.
- La progression est calculée à partir des étapes réelles et non d’un faux palier figé.
- iNrSend recharge l’historique actif toutes les 10 secondes et dispose d’une invalidation dédiée lors de l’arrivée ou de la mise à jour d’une publication finale.

## SQL déjà appliqués

Les migrations de reprise de lease et de lease vidéo appliquées précédemment restent compatibles :

- elles ne compressent, ne convertissent et ne suppriment aucun média ;
- elles empêchent deux workers de prendre simultanément la même tâche ;
- elles remettent en file une tâche expirée ou réconcilient une tâche déjà terminée ;
- `video_normalize_v1` désigne le type historique du job, pas une opération de compression.

Aucun SQL supplémentaire n’est nécessaire uniquement pour supprimer la compression du Booster. Les réparations SQL fournies dans `ops/sql` sont idempotentes et restent utiles aux captures IA et au rafraîchissement iNrSend.

## Vérifications exécutées

- 562 tests Booster, publication, canaux, iNrSend et certification : réussis.
- 114 tests JavaScript de règles média et pipeline : réussis.
- 130 tests TypeScript du pipeline média : réussis.
- Total : **806 tests réussis, 0 échec**.
- Vérification TypeScript : réussie.
- ESLint complet : réussi.
- Audits publication étapes 1, 3, 4 et 8 : réussis.
- Audit optimisation média : réussi.
- Audit pipeline média : réussi.

Le build Turbopack local ne peut pas être reproduit dans ce dossier de travail car `node_modules` est relié hors de la racine temporaire. Le contrôle Webpack de secours rencontre l’absence de réseau pour les polices Google et trois sélecteurs CSS déjà présents à l’identique dans le ZIP d’origine. Ces fichiers de base n’ont pas été modifiés. Les contrôles de code, de types et les 806 tests passent.

## Tests fonctionnels conseillés après déploiement

1. Génération puis publication de 5 images sur les canaux habituels.
2. Génération puis publication d’une vidéo MP4 H.264/AAC d’environ 30 Mo.
3. Génération puis publication d’une vidéo compatible comprise entre 70 et 75 Mo.
4. Tentative d’ajout d’un fichier de 75 000 001 octets pour vérifier son refus immédiat.
5. Vérification des captures IA avec une vidéo compatible.
6. Vérification du rafraîchissement automatique d’iNrSend sans recharger la page.
7. Vérification Google Business avec une vidéo de 30 secondes maximum et au moins 720p.

## Contenu de l’archive

L’archive contient le projet source complet et les tests. Elle exclut les dépendances, le cache Next.js, les fichiers `*.tsbuildinfo` et tout fichier `.env`.
