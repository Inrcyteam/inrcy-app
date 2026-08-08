# Bilan — Optimiseur média et bilan de publication

Date : 8 août 2026

## Référence conservée

Le travail repart du ZIP stable **media-flow-optimise + tous correctifs**. Le moteur de génération, la publication immédiate, la programmation, leurs reprises réseau et la préparation finale des médias n'ont pas été réécrits.

## Optimiseur média unifié

- La modale « Compresser le média » devient **« Optimiser le média »**.
- Le professionnel ne choisit plus un poids arbitraire : iNrCy applique automatiquement le plafond de l'outil.
  - Booster / publication : **50 Mo par image** et **75 Mo par vidéo**.
  - Mails et campagnes : **20 Mo**.
- Une optimisation peut effectuer une compression, une conversion, ou les deux.
- Les vidéos MP4, M4V et MOV déjà sous le plafond suivent toujours le parcours direct historique. Leur éventuelle normalisation interne reste silencieuse pendant la préparation de publication.
- Les formats WebM, MKV, AVI, MPEG, 3GP, TS, WMV, FLV et OGV sont acceptés comme sources et orientés vers l'optimiseur avant insertion.
- La copie vidéo produite est un **MP4 / H.264 / AAC / yuv420p** compatible avec le pipeline de publication.
- Le fichier original est conservé et la copie optimisée est réinsérée dans l'outil demandé.
- Le plafond d'une source vidéo reste fixé à **300 Mo**.
- Le même routage est actif dans Booster, la Médiathèque, iNrAgent, les campagnes, la composition d'e-mail et l'édition iNrSend.

Texte court harmonisé :

> Jusqu’à 5 images ou 1 vidéo (300 Mo max) · médias optimisés si nécessaire : format adapté et/ou poids ramené à 50 Mo/image ou 75 Mo/vidéo.

## Nouvelle modale de bilan de publication

- Une seule colonne, y compris lorsque dix canaux sont sélectionnés.
- Seuls les canaux réellement sélectionnés apparaissent.
- En-tête compact avec confettis et priorité visuelle donnée aux réussites.
- Bandeau de synthèse unique : publiés en vert, traitements en orange, échecs en rouge.
- Logos ronds utilisant exactement les mêmes fichiers, dimensions et règles de cadrage que le bandeau « Canaux » de Booster.
- Chaque ligne conserve son bouton **Voir** lorsqu'un lien public est disponible.
- Un petit bouton **i** apparaît sur les échecs et déplie le message précis ainsi que la règle concernée.
- Le bouton de reprise des échecs est conservé.
- Le bouton **Voir dans iNr'Send** utilise le dégradé iNrCy.

## Comptes sociaux

- TikTok est réhydraté depuis le statut OAuth et affiche le véritable `@nom_du_compte`.
- Un suffixe technique provenant d'un lien court TikTok ne peut plus devenir le nom affiché.
- Les liens Pinterest automatiques du bilan et d'iNrSend restent conservés et couverts par les tests.

## Contrôles effectués

- TypeScript complet : **réussi**.
- ESLint complet : **réussi**.
- Tests Booster, publication, Pinterest, TikTok et iNrSend : **571/571 réussis**.
- Tests pipeline média, formats, images et iNrAgent : **262/262 réussis**.
- Tests de certification, sécurité de contenu et multicompte : **102/102 réussis**.
- Essai FFmpeg réel WebM vers MP4 : sortie vérifiée en **H.264 + AAC + yuv420p**.

Le `next build` local de cette copie de travail n'est pas représentatif : Turbopack refuse le lien de test `node_modules` qui pointe vers le dossier de dépendances de la référence, tandis que le mode Webpack est bloqué par l'accès sortant aux polices Google et des règles CSS historiques non liées à ce lot. Le déploiement doit donc être reconstruit normalement par Vercel avec son installation propre des dépendances.

