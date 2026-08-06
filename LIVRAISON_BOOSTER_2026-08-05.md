# Livraison Booster Publisher iNrCy — 5 août 2026

## Résultat

Cette version remplace le parcours bloquant par un moteur de publication durable,
parallèle et isolé par canal.

- Génération : objectif UX 30 s, coupe-circuit absolu 45 s partagé par toutes les
  étapes. Aucun budget ne redémarre lors d'un fallback.
- Publication : accusé serveur durable avant réponse HTTP 202, puis fan-out de
  1 à 10 canaux en parallèle.
- Attente visible : plafond de 60 s sans finalisation média, 90 s lorsqu'une
  finalisation est nécessaire.
- Après le plafond : le bilan s'ouvre, les canaux non terminés restent
  « En traitement » et les workers continuent sans navigateur.
- Un média ou un fournisseur en échec ne bloque jamais les autres canaux.
- Les incompatibilités irréparables connues (durée, absence d'un type de média
  requis, etc.) restent visibles en rouge dans le bloc Médias et figurent dans
  le même bilan final.

## Causes racines corrigées

L'audit de la version en ligne a confirmé plusieurs coûts qui se cumulaient :

1. La requête de publication attendait encore des transformations vidéo longues
   avant de devenir durable.
2. Les préparations d'images étaient répétées canal par canal au lieu de partager
   une lecture et un encodage par source/profil.
3. Les mises à jour de chaque livraison déclenchaient des écritures et rafraîchissements
   Realtime concurrents sur la même ligne profil.
4. Le polling, les métriques et l'historique iNrSend relisaient trop de données et
   amplifiaient la charge lors d'une publication.
5. Certains échecs de prévalidation pouvaient disparaître du bilan ou retarder les
   canaux valides.
6. Le parcours Générer pouvait encore refaire une extraction/transcription vidéo
   locale après l'upload Supabase.

Sur la production observée avant correction : génération en 52,842 s, publication
bloquée en préparation média, 43 connexions sur 60, I/O à 72 %, erreurs Postgres
`57014` et pics CPU proches de 95 %. Ces chiffres constituent la référence avant
déploiement, pas une mesure après déploiement.

## Nouveau parcours technique

### 1. Ajout des médias

Le navigateur envoie uniquement la source dans le workspace Supabase. Les preuves
de format proviennent du serveur : Sharp pour les images, FFmpeg/ffprobe pour les
vidéos. Les métadonnées navigateur ne peuvent plus autoriser un original direct.

Formats source couverts :

- Images : JPG/JFIF, PNG, WebP, GIF, AVIF, HEIC/HEIF, TIFF et BMP ;
- Vidéos : MP4/M4V, MOV, WebM, MPEG, AVI, MKV, 3GP/3G2, TS, WMV, FLV et OGV ;
- Limites produit : 5 images, 50 Mo par image, 150 Mo au total, ou 1 vidéo de
  75 Mo maximum ; au-delà, le fichier doit d’abord être compressé hors du Booster.

Un original réellement compatible est conservé octet pour octet. Une source
incompatible mais adaptable reçoit une dérivée serveur minimale. GIF animé et
AVIF restent originaux sur les trois canaux internes compatibles
(`inrcy_site`, `site_web`, `inr_search`) ; les réseaux externes gardent une
politique conservatrice.

### 2. Génération

- Un seul appel multicanal principal, quel que soit le nombre de canaux.
- Une seule réparation groupée possible.
- Deadline absolue transmise du navigateur jusqu'au fournisseur IA.
- Upload et vérification de la source uniquement dans le chemin critique.
- Pas de vidéo complète, de conversion, ni de transcription audio attendue par
  le clic Générer en mode cutover Supabase.

### 3. Publication durable

Avant de répondre 202, le serveur insère atomiquement :

- un parent de publication ;
- un enfant durable par canal sélectionné ;
- les échecs rouges comme enfants terminaux non dispatchables.

Les canaux texte peuvent partir pendant que les canaux média finalisent leurs
dérivées. La préparation, le dispatch, les reprises et la finalisation globale
sont idempotents. Une relance conserve le même identifiant de publication.

Le cron `/api/cron/booster-publications` tourne chaque minute avec des quotas
séparés pour : nouvelle file, reprises anciennes et finalisation. Les jobs en
attente ne consomment pas leur budget de tentatives média.

### 4. Charge Supabase et iNrSend

La migration fournie :

- remplace le cycle `SELECT + fusion JS + UPDATE` par un patch JSON atomique ;
- remplace le trigger par ligne par des triggers statement-level ;
- ignore les bumps Realtime intermédiaires du parent asynchrone ;
- émet un seul bump métier lors de la finalisation du parent ;
- ajoute les index des files asynchrones, états JSON, livraisons et métriques ;
- empêche les métriques Propulser de scanner les payloads techniques ;
- borne et filtre les lectures d'historique iNrSend côté base.

## Certification locale

- 994 tests unitaires : réussis ;
- tests dédiés Realtime/index Supabase : réussis ;
- TypeScript : réussi ;
- ESLint global : réussi, zéro erreur ;
- build Next.js 16.2.11 : réussi ;
- compilation Turbopack : 16,9 s ;
- TypeScript du build : 22,1 s ;
- collecte et génération : 215 routes/pages validées ;
- contrôle anti-secrets : aucun fichier `.env`, aucune clé privée/JWT/token
  détecté dans le livrable.

Le runner Node Windows a été exécuté avec `--test-isolation=none` afin d'éviter
la restriction locale `spawn EPERM`. Le build a utilisé les worker threads et
des valeurs Supabase factices non sensibles uniquement pour la collecte statique.

## Déploiement recommandé

1. Faire un snapshot/backup Supabase et créer un déploiement Preview Vercel.
2. Exécuter
   `ops/sql/2026-08-05_publication_realtime_load_hardening.sql` dans Supabase.
   Ne pas entourer tout le fichier d'une transaction supplémentaire : les
   `CREATE INDEX CONCURRENTLY` sont volontairement placés après `COMMIT`.
3. Déployer le code du ZIP. Le fallback de compatibilité RPC couvre un rolling
   deploy court, mais la migration avant le code reste préférable.
4. Vérifier que `CRON_SECRET` est présent et que les crons Booster, normalisation
   image/vidéo et TikTok sont actifs.
5. Effectuer les smokes ci-dessous sur le compte de test avant promotion en prod.

## Smoke tests après déploiement

1. Phrase seule, 10 canaux : POST de publication renvoie 202 rapidement ; les
   enfants partent en parallèle.
2. Une image compatible : original direct sur les canaux compatibles, aucune
   dérivée inutile.
3. Un GIF animé : animation conservée sur les trois canaux internes ; adaptation
   isolée pour les réseaux externes.
4. Un MP4 H.264/AAC, yuv420p, FPS <= 60 : source directe lorsqu'elle respecte le
   canal.
5. Un MOV/MKV/WebM ou codec incompatible : dérivée MP4 serveur, sans attente
   bloquante du navigateur.
6. Vidéo trop longue pour un canal : ce canal est rouge/échoué, tous les autres
   sont diffusés.
7. Fermer Booster juste après le 202 : vérifier dans iNrSend que la publication
   continue et se finalise.
8. Après 60 s ou 90 s : vérifier que le bilan affiche les canaux non terminés
   « En traitement » au lieu de rester bloqué à 99 %.
9. Surveiller Supabase pendant le test : connexions, CPU, I/O, durée des requêtes
   `app_events`, `publication_deliveries` et bumps `profile_versions`.

## Livrables

- ZIP source : sans `node_modules`, `.next`, caches ou secrets ;
- ZIP complet : dépendances verrouillées incluses, mais sans `.next`, caches ou
  secrets ;
- migration SQL incluse dans les deux ZIP ;
- sommes SHA-256 fournies séparément.

La version corrigée n'a pas été déployée automatiquement sur la production. Le
test navigateur effectué avant correction a servi de baseline ; la validation
réelle des latences fournisseurs doit être faite sur la Preview puis en production
après application de la migration.
