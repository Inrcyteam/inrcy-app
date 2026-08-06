# Bilan final — pipeline vidéo Booster / Publisher iNrCy

## Résultat livré

Le pipeline vidéo a été unifié autour d'un seul master géré par l'application :

1. La source est envoyée directement dans le stockage durable.
2. À partir de **70 000 000 octets**, la normalisation compresse automatiquement la vidéo.
3. Le master vise **65 Mo** et doit rester strictement sous **70 Mo**.
4. Le master est produit en **MP4, H.264, 30 images/s**, avec audio compatible lorsqu'il existe.
5. Les captures et l'analyse IA d'une vidéo lourde utilisent ce master compressé, jamais le fichier lourd du navigateur.
6. La publication immédiate et la publication programmée consomment le même master canonique v2.
7. Pinterest attend en plus sa miniature publique ; TikTok utilise le master 30 fps et le flux photo reste indépendant.

Le clic sur **Générer** ou **Publier** reste autorisé pendant la préparation. Le travail durable continue côté serveur et l'utilisateur ne doit pas recliquer une deuxième fois.

## Corrections principales

- Suppression du fallback vidéo lourd vers le fichier original dans le parcours v2 strict.
- Sélection exacte des variantes v2 : canonique, miniature, captures IA, aperçu IA et piste audio.
- Reprise idempotente des anciens jobs v2 qui pointaient encore vers des variantes v1.
- Protection contre les leases expirées et les workers actifs, sans recréer de job en double.
- Migration protégée par une barrière transactionnelle `EXCLUSIVE NOWAIT` : aucune collision possible avec l'ancien RPC pendant son remplacement.
- Canonique vidéo partagé entre tous les canaux ; aucune nouvelle compression par canal.
- TikTok vidéo normalisé à 30 fps et TikTok photo conservé comme un vrai flux image.
- Pinterest vidéo bloqué uniquement tant que sa miniature requise n'est pas prête.
- Génération IA non bloquante : délai média borné, puis génération du texte pendant que le pipeline termine si nécessaire.
- Progression corrigée : **Compression des médias** pendant la compression réelle, puis **Préparation des médias** pour le reste. Une publication composée uniquement d'images n'affiche plus « Préparation de la vidéo ».
- Publication et programmation transportent explicitement le mode de cutover strict, avec rollback historique uniquement lorsque le cutover est désactivé.

## Ordre SQL à exécuter maintenant

Les migrations de reprise de lease et de lease vidéo longue ayant déjà été appliquées et vérifiées, il ne reste que :

1. `ops/sql/2026-08-06_video_normalization_v2_registry_repair.sql`
2. `ops/sql/2026-08-06_video_normalization_v2_registry_repair_verify.sql`

Ne pas rejouer ensuite l'ancienne migration `step6_video_normalization`.

La première migration est transactionnelle et idempotente. Si Supabase retourne `55P03`, ou le message `VIDEO_V2_REGISTRY_REPAIR_ACTIVE_LEASE`, aucune modification partielle n'est conservée : attendre la fin du worker en cours puis rejouer le même fichier.

Résultats attendus dans le verify :

- fonction présente et exécutable uniquement par `service_role` ;
- contrôles de sécurité et de concurrence à `true` ;
- compteurs d'anomalies à `0` ;
- aucune ligne dans les listes d'incohérences ou de doublons.

## Validation locale

- **882 tests réussis sur 882**, 0 échec.
- Suite complète `media-pipeline` réussie.
- Lint global réussi.
- Contrôle TypeScript des sources réussi.
- Les fichiers CSS signalés par le build Webpack ont exactement la même empreinte SHA-256 que ceux du ZIP d'origine : ils n'ont pas été modifiés par ce chantier.

Le build Next complet n'a pas pu être certifié dans l'environnement Codex pour deux raisons externes au correctif : le `node_modules` local est une jonction hors racine pour Turbopack, et Webpack rencontre le blocage réseau des polices ainsi que les règles CSS Modules déjà présentes dans la base d'origine. Aucun de ces fichiers n'est inclus parmi les changements vidéo.

## Test de recette conseillé après déploiement

1. Publier cinq images sur les canaux habituels : texte de progression « Préparation des médias », TikTok en mode photo.
2. Publier une vidéo légère : tous les canaux doivent consommer le master MP4/H.264/30 fps ; Pinterest doit recevoir sa miniature.
3. Insérer une vidéo supérieure à 70 Mo avant génération : observer « Compression des médias », lancer Générer sans attendre, puis vérifier que les captures IA proviennent du master.
4. Insérer une vidéo supérieure à 70 Mo dans le bloc Médias après génération : lancer Publier sans attendre et vérifier la reprise automatique jusqu'au résultat final.
5. Refaire le cas 4 avec une publication programmée.

La validation de production reste à confirmer par ces essais réels après déploiement du code et exécution du SQL.
