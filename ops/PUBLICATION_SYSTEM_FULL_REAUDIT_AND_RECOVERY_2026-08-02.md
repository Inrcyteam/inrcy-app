# iNrCy — Réaudit transversal publication et récupération vidéo

Date : 2026-08-02

## Contexte

Un déploiement de la nouvelle optimisation média a révélé une régression réelle : certaines vidéos dont la variante optimisée était absente, obsolète ou invalide pouvaient arrêter le parcours avant l'appel à `/api/booster/publish-now`.

## Cause racine

- Le cache vidéo avait été versionné en v6 afin d'invalider les anciennes variantes lourdes.
- Le contrôle préalable savait détecter une variante manquante.
- Le chemin de publication ne garantissait pas encore une récupération unique et contrôlée dans tous les cas.
- Une variante partielle ou invalide pouvait également être considérée comme réutilisable.

## Correctifs finaux

### Publication immédiate et programmée

- Contrôle rapide sans encodage lors du premier passage.
- Une seule tentative de génération lorsque la variante manque ou est invalide.
- Nouvelle validation après génération.
- Repli sur l'original uniquement si la source est réellement compatible avec le canal.
- Blocage explicite, avec cause précise, si une source incompatible ne peut pas être préparée.
- Même filet de sécurité côté serveur pour les appels directs, programmés et repris.

### Cache vidéo

- Validation des dérivés avant réutilisation.
- Une variante partielle, obsolète ou invalide est régénérée.
- Pas de boucle de génération : une seule récupération est autorisée par tentative de publication.

### Rapidité

- Les médias déjà prêts conservent le chemin rapide.
- L'encodage n'est lancé que lorsqu'il est nécessaire.
- Les vidéos déjà efficaces utilisent le remux sans perte.
- Les variantes valides restent mises en cache et sont réutilisées.

### IA

- La référence Anthropic qui renvoyait 404 a été remplacée.
- Les erreurs non récupérables, comme un modèle introuvable, déclenchent immédiatement le moteur de secours au lieu de répéter le même appel.

### SQL historique

Les deux scripts SQL historiques suivants ont été restaurés à l'identique de la base d'origine :

- `ops/sql/2026-07-30_media_pipeline_step10_performance_hardening.sql`
- `ops/sql/2026-07-30_media_pipeline_step10_verify.sql`

Aucun SQL n'est à exécuter pour ce correctif.

## Comparaison avec le ZIP d'origine

- 1 737 fichiers dans la base nettoyée.
- 1 775 fichiers dans la version finale nettoyée.
- 1 675 fichiers strictement inchangés.
- 62 fichiers modifiés.
- 38 fichiers ajoutés, principalement des modules ciblés, audits et tests.
- 0 fichier de la base supprimé.
- `package-lock.json` inchangé.
- Aucune dépendance ajoutée.

## Validation effectuée

### Tests automatisés transversaux

- 824 tests lancés en une exécution fraîche.
- 824 réussis.
- 0 échec.

La couverture inclut notamment :

- publication immédiate ;
- programmation générale et par canal ;
- récupération vidéo et cache ;
- images, vidéos et règles médias ;
- Google Business ;
- Facebook et Instagram ;
- TikTok et états non terminaux ;
- Pinterest ;
- iNrAgent ;
- iNrSend ;
- dashboard ;
- iNrSearch ;
- multicompte ;
- AI Gateway ;
- sécurité des contenus Booster ;
- idempotence et prévention des doublons.

### Contrôles statiques

- TypeScript complet : validé.
- ESLint sur les 85 fichiers de code modifiés ou ajoutés : aucune erreur, aucun avertissement.
- Tous les audits publication étapes 1 à 8 : validés.
- Audit optimisation média : validé.
- Audits pipeline média étapes 1 à 10 : validés.
- Audit AI Gateway : validé.

### Build local

Le build Next n'a pas pu démarrer dans l'environnement d'audit, car le registre de paquets disponible renvoie 404 lors du téléchargement du binaire natif Linux `@next/swc-linux-x64-gnu@16.2.11`.

L'échec intervient avant le chargement du code applicatif. Le build Vercel reste donc la validation finale obligatoire.

## Contrôles après déploiement

Tester en priorité le scénario qui avait échoué :

1. sélectionner la même vidéo ;
2. sélectionner Site web, iNrSearch et TikTok ;
3. lancer Vérifier et publier ;
4. vérifier dans les logs :
   - `workspace/prewarm` ;
   - éventuellement `media-video-normalization` ;
   - puis `POST /api/booster/publish-now`.

Effectuer ensuite une programmation courte avec la même vidéo afin de confirmer le chemin cron réel.

## Verdict

La régression identifiée est corrigée et couverte par des tests dédiés et transversaux. Aucun audit local ne peut garantir l'absence absolue de tout défaut lié aux API externes ou à l'environnement de production ; le build Vercel et les tests réels de publication restent nécessaires avant de considérer le déploiement définitivement validé.
