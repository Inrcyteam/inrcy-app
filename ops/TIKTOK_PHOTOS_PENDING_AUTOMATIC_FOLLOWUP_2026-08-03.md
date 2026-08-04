# TikTok photos - suivi automatique des publications en attente

Date : 3 août 2026

## Symptôme observé

Après l'envoi d'une ou plusieurs photos vers TikTok, l'API renvoyait bien un `publish_id`, puis iNrCy affichait « Envoi accepté, traitement en cours ». La publication pouvait ensuite rester indéfiniment dans cet état dans le bilan et dans iNrSend.

## Cause racine identifiée

Le premier envoi n'était pas bloqué. Le problème venait du suivi asynchrone :

- `waitForTiktokInitialStatus()` ne vérifiait le statut que quatre fois pendant environ 4,5 secondes ;
- après cette courte fenêtre, la livraison était enregistrée en `processing` ;
- le seul suivi ultérieur se trouvait dans la modale de détail iNrSend et s'arrêtait dès que cette modale était fermée ;
- aucun processus serveur ne reprenait durablement les publications TikTok encore en traitement.

Le texte « iNrSend vérifie automatiquement » ne correspondait donc pas au comportement réel pour une publication laissée sans modale ouverte.

## Correctif appliqué

### 1. Suivi serveur permanent

Ajout de `lib/tiktokPendingPublicationWatcher.ts` et de la route protégée :

- `/api/cron/tiktok-publications`
- exécution Vercel toutes les minutes ;
- lecture des livraisons TikTok en statut `processing` ;
- récupération ou rafraîchissement du jeton TikTok ;
- appel de l'endpoint TikTok de statut avec le `publish_id` ;
- mise à jour synchronisée de `publication_deliveries` et de l'événement iNrSend ;
- conservation des états intermédiaires, du nombre d'octets téléchargés et du motif d'échec final ;
- détection d'un traitement prolongé sans déclencher de nouvelle publication automatique.

Le lot par défaut est limité à 20 vérifications par minute afin de rester sous le plafond de statut TikTok par utilisateur.

### 2. Mise à jour en direct du bilan Booster

La modale de résultat reçoit désormais le `publicationId` et interroge le statut TikTok :

- première vérification après 8 secondes ;
- vérification toutes les 15 secondes, puis toutes les 30 secondes ;
- durée maximale de suivi visuel : 5 minutes ;
- passage automatique de « En traitement » à « Publié » ou « Échec » ;
- fonctionnement également depuis iNrAgent.

Le cron serveur continue le suivi après fermeture de la modale.

### 3. Diagnostic des images récupérées par TikTok

La route publique `/api/media/tiktok` écrit maintenant dans les logs Vercel des événements sûrs :

- média servi avec succès ;
- signature expirée ou invalide ;
- média absent du stockage ;
- conversion photo impossible.

Les signatures, jetons et URL complètes ne sont jamais journalisés.

### 4. Cas d'erreur supplémentaires

- un `publish_id` absent est maintenant enregistré comme échec dans iNrSend et dans la livraison ;
- un problème temporaire de lecture du statut est enregistré comme « Vérification impossible » au lieu de laisser un état muet ;
- aucun retry automatique de publication n'est lancé tant que TikTok n'a pas confirmé un échec, afin d'éviter les doublons.

## Impact fonctionnel

- les publications TikTok déjà en `processing` sont reprises automatiquement après déploiement ;
- si TikTok termine la publication, iNrSend passe à « Publié » ;
- si TikTok refuse la photo, le motif final français remplace l'attente infinie ;
- les autres canaux ne sont pas modifiés ;
- aucune migration SQL, aucune dépendance et aucune nouvelle variable d'environnement ne sont nécessaires ;
- le cron réutilise le secret déjà employé par les autres tâches Vercel.

## Vérifications

- tests TikTok : 12/12 ;
- suite Dashboard + iNrSend + publication + TikTok : 257/257 ;
- analyse syntaxique TypeScript ciblée : réussie ;
- archive sans dépendances : aucun `node_modules` ajouté.

Le typecheck, le lint et le build complets doivent être relancés dans le dépôt normal avec les dépendances installées.
