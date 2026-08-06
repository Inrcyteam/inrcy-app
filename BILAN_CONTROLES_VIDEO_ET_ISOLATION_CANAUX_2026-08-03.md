# Bilan — contrôles vidéo, conversions et isolation des canaux

Date : 3 août 2026

## Résultat

Le système contrôle désormais la durée réelle de la vidéo pour chaque canal avant l'envoi. Un canal non compatible devient rouge dans la zone **Médias**, ce qui rend également sa bulle rouge dans **Aperçu**. Le motif détaillé apparaît sous les choix **Vidéo / Photos / Aucun** avec la durée constatée et la règle du canal.

Un canal bloqué ou en échec ne fait plus échouer les autres : seuls les canaux publiables sont envoyés. Cette isolation s'applique à la publication immédiate, à la programmation et aux republications iNr'Send. Le bilan final conserve chaque résultat séparément.

## Correction importante pour Pinterest

Le flux utilisé par iNrCy crée une épingle vidéo standard avec un `video_id`. La règle officielle correspondante est **4 secondes minimum et 15 minutes maximum**. La limite de 5 minutes appartient au format **Annonce Idée** et ne doit pas être appliquée à ce flux.

La vidéo de test de **10 min 36 s** est donc valide côté durée sur Pinterest. Son ancien échec était technique, pas une violation de durée. iNrCy prépare maintenant une variante réseau compatible et, si Pinterest refuse encore l'envoi ou le traitement, le bilan affichera l'erreur Pinterest exacte sans annuler les autres canaux.

## Matrice des durées appliquée

| Canal | Contrôle avant publication | Comportement |
|---|---:|---|
| Site web / iNr'Search | Pas de limite fournisseur supplémentaire | Conservation de la source dans la limite d'import iNrCy |
| Google Business | 30 s maximum | Canal rouge au-delà de 30 s |
| Facebook | 4 h maximum | Canal rouge au-delà de 4 h |
| Instagram | 3 s à 15 min | Canal rouge sous 3 s ou au-delà de 15 min |
| LinkedIn | 3 s à 30 min | Canal rouge sous 3 s ou au-delà de 30 min |
| TikTok | Limite réelle du compte connecté, avec plafond technique iNrCy de 10 min | La limite est récupérée par `creator_info`; canal rouge si elle est dépassée ou invérifiable avant l'envoi |
| YouTube | Jusqu'à 3 min : Short vertical automatique; au-delà : vidéo normale; plus de 15 min : autorisation de vidéos longues exigée; 12 h maximum | Le statut `longUploadsStatus` de la chaîne est vérifié; canal rouge si l'autorisation requise manque |
| Pinterest | 4 s à 15 min pour l'épingle vidéo standard | Canal rouge sous 4 s ou au-delà de 15 min |

Toutes les bornes sont inclusives : par exemple, **3 min exactement** reste un Short YouTube et **15 min exactement** reste accepté sur Pinterest.

## Affichage avant publication

- La bulle du canal dans **Médias de la publication** passe en rouge lorsqu'une règle de durée bloque ce canal.
- La bulle correspondante dans **Aperçu** passe également en rouge.
- Le message est placé dans le cadre média, sous **Vidéo / Photos / Aucun**.
- Le message indique le canal, la durée réelle et la règle complète. Exemple : `Pinterest bloqué — cette vidéo dure 15 min 1 s. Règle Pinterest : entre 4 secondes et 15 minutes pour une épingle vidéo standard.`
- Un clic sur la bulle rouge ouvre le détail du canal concerné.

## Conversions vidéo finalisées

Les incompatibilités récupérables ne bloquent pas le fichier à l'insertion. Pour chaque réseau externe, iNrCy prépare une variante dédiée avec :

- conteneur MP4;
- vidéo H.264;
- audio AAC stéréo;
- pixel format `yuv420p`;
- cadence normalisée à 30 images/s;
- rotation et horodatage normalisés;
- dimensions ramenées dans les bornes réseau, sans agrandissement inutile;
- ajout d'un fond sobre pour les rapports extrêmes, sans recadrage destructif;
- débit adapté à la durée, à la source et au plafond de poids du canal;
- conservation de la durée : aucune coupe silencieuse avec `-shortest`.

Une source brute non conforme n'est plus envoyée comme solution de secours vers un réseau externe. Si la conversion dédiée n'est pas prête ou échoue, seul ce canal est déclaré en échec avec un motif technique exploitable. Les surfaces internes iNrCy peuvent toujours utiliser la source d'origine lorsqu'elle est compatible avec leur propre politique.

## Isolation et bilan final

- **Publication immédiate** : les canaux bloqués au précontrôle sont retirés du dispatch; les autres partent normalement; les échecs préalables sont fusionnés dans le bilan final.
- **Publication programmée** : seuls les canaux valides sont programmés; la confirmation liste les canaux bloqués et leur première raison précise.
- **iNr'Send / reprise** : une vidéo Facebook, LinkedIn ou Google Business en échec n'est plus transformée en faux succès « texte publié sans vidéo ».
- **Erreurs fournisseur** : refus d'upload, traitement impossible, permissions, compte ou conversion restent attachés au canal concerné.
- **Résultat global** : un succès partiel reste un succès partiel; l'échec d'un canal ne remplace plus les réussites des autres.

## Vérifications réalisées

- TypeScript : **0 erreur** (`tsc --noEmit`).
- ESLint : **0 erreur et 0 avertissement**, y compris sur le contrôle complet du projet.
- Régressions publication, chaîne média, Pinterest et préchauffage vidéo : **266/266 tests réussis**.
- Régressions tableau de bord, iNr'Send et règles médias : **164/164 tests réussis**.
- Total exécuté : **430/430 tests réussis**.

La compilation Next.js complète a aussi été tentée dans la copie de validation. Le mode Turbopack refuse le lien local utilisé uniquement pour partager `node_modules` pendant les tests; le mode Webpack atteint ensuite deux contraintes indépendantes du correctif : accès réseau aux polices Google désactivé et anciens sélecteurs CSS globaux déjà présents. Les contrôles TypeScript, lint et les 430 tests du périmètre sont verts.

## Références officielles vérifiées

- Pinterest — spécifications vidéo standard : https://help.pinterest.com/fr/business/article/pinterest-product-specs
- Pinterest Developers — création d'épingles image et vidéo : https://developers.pinterest.com/docs/work-with-organic-content-and-users/create-boards-and-pins/
- Google Business Profile — vidéos jusqu'à 30 secondes, 75 Mo, 720p : https://support.google.com/business/answer/6103862?hl=fr
- TikTok Content Posting API — limites vidéo et plafond technique : https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide
- LinkedIn Videos API — 3 secondes à 30 minutes : https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api?view=li-lms-2026-07
- YouTube — Shorts jusqu'à 3 minutes : https://support.google.com/youtube/answer/15424877?hl=fr
- YouTube — vidéos de plus de 15 minutes et plafond 12 heures : https://support.google.com/youtube/answer/71673?hl=fr
- YouTube Data API — statut `longUploadsStatus` : https://developers.google.com/youtube/v3/docs/channels?hl=fr
