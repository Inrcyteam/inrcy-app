# Bilan — performance, fiabilité et observabilité — 08/08/2026

## Base verrouillée

Les corrections partent exclusivement de `inrcy-app-optimiseur-media-et-bilan-FINAL-2026-08-08.zip`, dernier ZIP disponible au lancement de cette intervention. Le ZIP de référence et son dossier extrait sont restés intacts.

## Accélération sûre de la génération

- Le prompt principal effectue un contrôle final silencieux avant de rendre son JSON : présence de chaque canal, langue, ancrage dans la demande, différenciation, contraintes de longueur et absence de fuite de consigne.
- L'objectif est de réduire les seconds passages de réparation, qui représentaient la principale source de variabilité du temps de génération.
- La réparation groupée existante reste active : aucune sécurité de contenu n'a été retirée et aucun changement n'a été apporté aux règles de publication.

## Indicateurs de performance ajoutés

- Génération : préparation média, appel principal, réparation, durée totale, canaux conformes dès le premier passage, canaux réparés et types d'anomalies détectées.
- Transcription audio optionnelle : durée, modèle et résultat disponible/indisponible.
- Optimisation média : chargement, recherche d'une copie existante, téléchargement, conversion/compression, téléversement/enregistrement, finalisation, durée totale et ratio de poids.
- Les durées HTTP globales de publication restent mesurées par le journal `api_request` déjà présent.

## Fiabilité et nettoyage des alertes

- Les gros médias privés ne transitent plus intégralement dans la mémoire d'une Function Vercel : l'accès authentifié est validé, puis le fichier est diffusé directement par Supabase Storage via une URL signée courte. Cela supprime la cause des dépassements mémoire observés sur des médias volumineux.
- Les lectures répétées de la langue du profil sont regroupées et mises en cache cinq minutes par compte, ce qui supprime la rafale de requêtes identiques signalée par Sentry.
- Le client IMAP possède désormais des délais bornés, un gestionnaire d'erreur explicite et une fermeture sûre. Une authentification refusée marque la boîte comme à reconnecter au lieu de générer la même alerte à chaque scan.
- Le vocal Booster utilise désormais le protocole de transcription officiel Vercel AI Gateway (protocole `0.0.1`, spécification audio `4`). Le coupe-circuit global qui pouvait rendre le vocal indisponible pour tous les comptes après une seule erreur a été supprimé.
- La capture vocale est renforcée sur téléphone : WebM/Opus sur Android/Chrome, MP4 audio sur iPhone/Safari, Ogg/WebM selon Firefox, normalisation du type MP4 et dictée native uniquement en solution de repli si l'enregistrement audio n'existe pas sur le navigateur.
- Les jetons YouTube expirés/révoqués sont classés comme reconnexion requise. Les erreurs inattendues restent des warnings.
- Les états normaux de récupération (`workspace_media_not_ready`, garde-fou tarifaire conservateur) restent visibles en information sans polluer les warnings.

## Contrôle des traces provenant d'anciens ZIP

- Les réponses Supabase 406 déjà corrigées par `maybeSingle()` dans la base actuelle n'ont pas entraîné une seconde correction inutile.
- Les conflits 409 liés aux verrous d'idempotence/notifications ont été conservés : ils protègent contre les doublons et ne constituent pas un échec métier.
- Deux tests hérités étaient déjà en échec dans le ZIP de référence intact. Ils ont uniquement été réalignés sur les mécanismes actuels de récupération fournisseur et de préchauffage vidéo; le code métier correspondant n'a pas été modifié.

## Validation

- 1 311 contrôles automatisés réussis sur 1 311, répartis dans 256 fichiers de tests.
- ESLint complet : réussi, aucune erreur remontée.
- TypeScript complet : réussi, aucune erreur remontée.
- Le build Turbopack local est empêché par le lien isolé vers `node_modules`; le build Webpack atteint la compilation puis rencontre l'accès réseau Google Fonts interdit et des sélecteurs CSS historiques dans des fichiers strictement inchangés. Ces limites ne proviennent d'aucun fichier corrigé dans cette intervention.

## Déploiement

Un nouveau déploiement Vercel est nécessaire pour appliquer à la fois ce code et le réglage Function CPU `Performance` enregistré dans le projet.
