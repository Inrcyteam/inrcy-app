# Stabilisation iNrCy - Etape 3

Date : 2026-06-21

Objet : verifier la capacite de restauration Supabase et identifier ce qui n'est pas couvert par les backups automatiques.

Regle de l'etape : observation uniquement. Aucun restore, aucune modification de bucket, aucune modification de policy.

## Sources analysees

- Capture Supabase Database > Backups > Scheduled backups
- Capture Supabase Storage > Files > Buckets
- Capture Supabase Storage > Files > Policies
- Captures de detail des buckets `booster`, `inrbox_attachments`, `logos`
- Scan du code pour relier les buckets a leurs usages applicatifs
- SQL de controle read-only : `SQL_CONTROLE_STORAGE_POLICIES_2026-06-21.sql`
- Fichiers deja produits :
  - `STABLE_SNAPSHOT_2026-06-21.md`
  - `STABILISATION_ETAPE_2_CONFIG_2026-06-21.md`

## Conclusion courte

La base de donnees Supabase est bien sauvegardee automatiquement tous les jours.

Le point important : les fichiers Supabase Storage ne sont pas inclus dans ces backups. Il faut donc prevoir une strategie de sauvegarde separee pour les medias, documents, logos, pieces jointes et rapports.

## Backups Supabase Database

Etat observe :

- Projet : Application iNrCy
- Environnement : main / production
- Backups planifies visibles
- Type : physical
- Frequence visible : quotidienne, autour de minuit UTC
- Backups visibles :
  - 2026-06-21 00:24:33 UTC
  - 2026-06-20 00:18:02 UTC
  - 2026-06-19 00:15:11 UTC
  - 2026-06-18 00:20:24 UTC
  - 2026-06-17 00:18:00 UTC
  - 2026-06-16 00:15:57 UTC
  - 2026-06-15 00:15:21 UTC
  - 2026-06-14 00:18:47 UTC

Interpretation :

- La base est couverte par au moins 8 sauvegardes quotidiennes visibles.
- En cas d'incident base de donnees, le retour arriere est possible depuis Supabase.
- Ne jamais cliquer sur `Restore` en production pour tester. Un test de restauration doit se faire plus tard sur un nouveau projet ou un environnement isole.

## Limite majeure des backups Supabase

Message observe dans Supabase :

- Les objets Storage ne sont pas inclus dans les backups database.
- La base contient seulement les metadonnees des objets.
- Restaurer une ancienne base ne restaure pas les fichiers supprimes depuis le Storage.

Impact pour iNrCy :

- Si un fichier Storage est supprime, le backup database seul ne suffit pas.
- Les historiques peuvent pointer vers un fichier qui n'existe plus.
- Les documents, medias, rapports ou logos doivent avoir une sauvegarde specifique.

## Buckets Storage observes

| Bucket | Public | Policies | Limite | Types MIME visibles | Usage probable |
| --- | --- | ---: | --- | --- | --- |
| `inr-agent-reports` | non visible comme public | 0 | 8 MB | `application/pdf` | rapports PDF iNrAgent |
| `inrcy-image-bank` | non visible comme public | 0 | 5 MB | `image/jpeg`, `image/png`, `image/webp` | banque d'images admin / iNrAgent |
| `booster` | oui | 0 | 40 MB | Any | medias Booster, videos, images publiques, signatures |
| `inrbox_attachments` | non visible comme public | 4 | 50 MB | Any | pieces jointes mails, devis, factures, iNrSend |
| `logos` | non visible comme public | 4 | Unset, 50 MB | Any | logos de profil / identite utilisateur |

## Policies Storage observees

Vue Storage > Policies :

- `inr-agent-reports` : aucune policy visible.
- `inrcy-image-bank` : aucune policy visible.
- `booster` : bucket public, aucune policy visible.
- `inrbox_attachments` :
  - `inrbox_attachments_select_own` : SELECT, applique a `authenticated`
  - `inrbox_attachments_insert_own` : INSERT, applique a `authenticated`
  - `inrbox_attachments_update_own` : UPDATE, applique a `authenticated`
  - `inrbox_attachments_delete_own` : DELETE, applique a `authenticated`
- `logos` :
  - policy SELECT visible, appliquee a `public`
  - policy UPDATE visible, appliquee a `public`
  - policy DELETE visible, appliquee a `public`
  - policy INSERT visible, appliquee a `public`

Interpretation prudente :

- `inrbox_attachments` est le plus clair : les 4 operations sont reservees aux utilisateurs authentifies, ce qui colle au script SQL local.
- `booster` est public volontairement ou historiquement, probablement pour servir les medias publies, les variantes video et les signatures.
- `logos` merite une verification plus tard : les policies sont appliquees a `public`, mais la capture ne montre pas les conditions SQL. Cela ne veut pas forcement dire acces libre total ; il faut ouvrir chaque policy pour verifier si elle limite bien par utilisateur ou par chemin.
- `inr-agent-reports` et `inrcy-image-bank` n'ont pas de policies visibles : si tout passe par le serveur avec la service role, cela peut etre normal.

## Detail des buckets critiques

`booster` :

- Bucket marque `PUBLIC`.
- Contient de nombreux dossiers avec noms de type identifiant utilisateur ou identifiant technique.
- Contient aussi un dossier `signatures`.
- Bouton Policies visible, sans compteur de policies sur la capture.
- Risque a suivre : des medias pre-publication ou anciens medias peuvent rester publics si aucun nettoyage ou expiration ne les retire.

`inrbox_attachments` :

- Bucket non marque public dans la capture.
- Bouton Policies avec compteur `4`.
- Contient plusieurs dossiers de type identifiant utilisateur et un dossier `mail-attachments`.
- Usage sensible : devis, factures, pieces jointes, historiques iNrSend.
- Etat rassurant : correspond aux policies authenticated et au script SQL local.

`logos` :

- Bucket non marque public dans la capture.
- Bouton Policies avec compteur `4`.
- Contient plusieurs dossiers de type identifiant utilisateur.
- Usage : logos de profil / identite des comptes.
- Point a verifier plus tard : conditions exactes des 4 policies appliquees a `public`.

## Detail SQL des policies Storage

Captures ajoutees ensuite pour `logos` et `inrbox_attachments`.

`logos` :

- Les 4 policies sont appliquees aux roles publics par defaut, mais elles contiennent une condition sur `auth.uid()`.
- Condition observee :
  - bucket = `logos`
  - premier dossier du chemin = `auth.uid()`
- Forme observee :
  - `(bucket_id = 'logos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])`
- Interpretation :
  - un visiteur non connecte a `auth.uid()` vide, donc la condition ne doit pas passer ;
  - un utilisateur connecte ne doit pouvoir agir que dans son propre dossier ;
  - ce n'est donc pas une urgence de securite.
- Point d'amelioration possible plus tard :
  - passer les policies `logos` de role public implicite a role `authenticated` explicite ;
  - rendre le `WITH CHECK` de l'UPDATE explicite si necessaire.

`inrbox_attachments` :

- Les 4 policies sont appliquees au role `authenticated`.
- Conditions observees :
  - bucket = `inrbox_attachments`
  - premier dossier du chemin = `auth.uid()`
- Les policies couvrent SELECT, INSERT, UPDATE, DELETE.
- L'UPDATE a bien une condition `USING` et une condition `WITH CHECK`.
- Interpretation :
  - configuration coherente ;
  - conforme au script SQL local `ops/sql/2026-05-03_inrsend_history_files.sql` ;
  - aucun correctif urgent.

## Correspondance avec le code

Usages confirmes par le code :

- `inr-agent-reports` : generation et stockage des rapports PDF iNrAgent.
- `inrcy-image-bank` : banque d'images, preparation de publication iNrAgent, routes admin image bank.
- `booster` : uploads medias Booster, transformations video, publication, signature image iNrSend.
- `inrbox_attachments` : pieces jointes iNrSend, devis, factures, templates mails.
- `logos` : upload et affichage du logo de profil.

Le bucket `inrbox_attachments` a un script SQL local qui confirme une logique privee par utilisateur :

- bucket prive
- limite 50 MB
- policies select / insert / update / delete pour l'utilisateur authentifie
- chemins attendus sous l'identifiant utilisateur

## Ce qui est sain

- Les backups database quotidiens existent.
- Les buckets sont limites en taille, ce qui reduit les risques d'abus.
- Les buckets sensibles `inrbox_attachments` et `logos` ont 4 policies visibles.
- Le bucket `booster` est public, ce qui semble coherent pour des medias de publication consultables publiquement.
- Les buckets `inr-agent-reports` et `inrcy-image-bank` n'apparaissent pas publics, et peuvent etre geres cote serveur.
- Les dossiers Storage semblent organises par identifiants, ce qui est compatible avec une isolation par utilisateur.

## Points a ne pas changer maintenant

- Ne pas modifier les policies Storage depuis le dashboard.
- Ne pas rendre un bucket public ou prive sans test complet.
- Ne pas changer les limites de taille sans verifier les parcours Booster, devis, factures, mails et iNrAgent.
- Ne pas tester `Restore` sur le projet production.
- Ne pas supprimer le bucket public `booster` : il est utilise par plusieurs parcours.
- Ne pas changer les policies `logos` avant d'avoir lu leurs conditions SQL exactes.
- Apres lecture des conditions SQL, ne pas corriger `logos` a chaud : l'etat actuel est restrictif par `auth.uid()`.

## Risque restant

Le risque restant principal n'est pas la base de donnees. C'est la sauvegarde des fichiers Storage.

Priorite de risque :

1. `inrbox_attachments` : documents, devis, factures, pieces jointes.
2. `logos` : identite visuelle des comptes.
3. `booster` : medias de publications et historiques.
4. `inr-agent-reports` : rapports PDF iNrAgent.
5. `inrcy-image-bank` : banque d'images.

## Actions 0 risque a faire ensuite

1. Executer uniquement le SQL de controle read-only si besoin.
2. Noter si Supabase propose une option d'export ou de backup Storage dans ton plan actuel.
3. Documenter une procedure manuelle de restauration :
   - restaurer le code source depuis l'archive stable ;
   - restaurer les variables Vercel ;
   - restaurer la base Supabase depuis un backup ;
   - restaurer les fichiers Storage depuis une copie externe ;
   - redeployer en Preview ;
   - valider les parcours critiques avant production.
4. Plus tard seulement, tester une restauration sur un projet separe.

## Pieces a me fournir ensuite

- Detail du bucket `inr-agent-reports`.
- Detail du bucket `inrcy-image-bank`.
- Capture Vercel > Deployments avec le dernier deploy production reussi.
- Capture Vercel > Domains.

## Decision

On peut considerer que l'etape 3 confirme une base saine pour la database, mais incomplete pour les fichiers.

Avant de reprendre du gros developpement, la prochaine stabilisation utile est de documenter les policies Storage et de definir comment on sauvegarde les fichiers hors backup database.
