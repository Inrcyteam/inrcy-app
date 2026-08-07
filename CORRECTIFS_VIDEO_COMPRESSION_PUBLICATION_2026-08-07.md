# Correctifs vidéo, compression et publication — 7 août 2026

Ce paquet repart du ZIP `inrcy-app-media-flow-optimise.zip` fourni le 7 août 2026.

## Causes confirmées

1. Une copie compressée pouvait revenir de la Médiathèque avec un titre sans extension. Booster reconstruisait alors un objet `File` sans `.mp4` et refusait la vidéo, même si son contenu était bien un MP4.
2. Un conteneur `.mp4` ne garantit pas que ses pistes sont compatibles. La vidéo de reproduction contient une piste vidéo H.264 mais une piste audio MP3. Le serveur exigeait H.264/AAC et arrêtait donc la préparation de tous les canaux utilisant ce média partagé.

## Corrections incluses

- Réinsertion automatique et manuelle des médias avec leur vrai `original_file_name`, puis le nom Storage en secours. Une ancienne vidéo sans extension reçoit une extension `.mp4` valide.
- Confirmation explicite de la réussite d'insertion : la modale ne déclare plus une insertion réussie si Booster a refusé le fichier.
- File d'optimisation conservée pour plusieurs images trop lourdes et messages explicites pour une source dépassant la limite d'import.
- Fallback serveur de publication : MP4, vidéo H.264, pixels `yuv420p`, audio AAC, cadence maximale 60 i/s et poids maximal 75 Mo.
- Chemin rapide : si seule la piste audio est incompatible, la vidéo H.264 est conservée sans réencodage et seule la piste audio est convertie en AAC.
- Réencodage complet uniquement lorsque c'est nécessaire (codec, dimensions, cadence, rotation ou poids), avec contrôle du fichier produit avant publication.
- Une variante canonique prête rend le média publiable même si l'original ne l'est pas. Les échecs d'un canal restent isolés des autres canaux.
- Enchaînement durable validé : préparation IA, puis ajout ultérieur de la mission publication, puis reprise automatique des sorties encore manquantes.

## Validations effectuées

- TypeScript : réussi.
- ESLint sur tous les fichiers modifiés : réussi.
- Compilation Next/Turbopack : code compilé avec succès ; l'étape suivante est limitée localement par l'interdiction de lancer un sous-processus dans le bac à sable.
- Tests ciblés : réinsertion Médiathèque, optimisation autonome, sélection génération, workspace persistant, missions IA/publication, reprise des jobs, progression, politique 75 Mo, isolation des canaux et certification Booster.
- Fichier réel de reproduction, 92 025 077 octets, H.264 + MP3 : copie obtenue de 58 760 428 octets en MP4/H.264/AAC, reconnue directement publiable.
- Échantillon H.264 + MP3 sous 75 Mo : conversion rapide en MP4/H.264/AAC vérifiée.
- Vidéo témoin qui réussit déjà : H.264 + AAC, reconnue directement publiable sans adaptation obligatoire.

## Déploiement

Ce ZIP contient du code source corrigé : un nouveau build et un nouveau déploiement Vercel sont nécessaires. Ne réutilisez pas le précédent ZIP corrigé.
