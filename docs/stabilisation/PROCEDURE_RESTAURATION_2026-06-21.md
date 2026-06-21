# Procedure de restauration iNrCy

Date : 2026-06-21

Objectif : savoir restaurer iNrCy sans improviser, sans exposer de secrets et sans aggraver un incident.

Cette procedure ne contient aucune valeur de secret.

## References stables

- Archive source stable : `inrcy-stable-prod-2026-06-21-source.zip`
- Empreinte SHA-256 source stable : `E85773C40F8D8FD5F570F28A78239BEE668D4374E9E5D47E562C37DF740008E7`
- Deploiement Vercel production observe : `BDW1Dha4w`
- Commit production observe : `15a1935`
- Branche production : `main`
- Domaine production : `app.inrcy.com`
- Domaine Vercel : `inrcy-app.vercel.app`

## Regle d'or

En cas d'incident, ne pas tout changer en meme temps.

Ordre conseille :

1. Identifier la zone touchee.
2. Sauvegarder l'etat actuel avant correction.
3. Restaurer ou corriger la zone minimale.
4. Tester en Preview ou environnement isole.
5. Remettre en production seulement apres validation.

## Identifier le type d'incident

### Incident deploiement

Exemples :

- nouvelle version qui casse l'app ;
- build Vercel echoue ;
- page blanche ;
- erreur apparue juste apres un deploy.

Action prioritaire :

- utiliser Vercel pour revenir au dernier deploiement production stable ;
- ne pas toucher a Supabase ;
- ne pas toucher aux DNS ;
- ne pas changer les variables d'environnement sauf preuve claire.

### Incident configuration

Exemples :

- variable manquante ;
- webhook qui ne repond plus ;
- OAuth qui bloque ;
- changement de secret.

Action prioritaire :

- comparer Vercel, GitHub Actions et la documentation d'etape 2 ;
- corriger uniquement la variable concernee ;
- redeployer en Preview si possible.

### Incident base de donnees

Exemples :

- donnees supprimees ;
- migration problematique ;
- table ou policy cassees ;
- donnees utilisateur incoherentes.

Action prioritaire :

- ne pas cliquer sur Restore en production sans decision explicite ;
- verifier l'heure exacte de l'incident ;
- restaurer d'abord vers un nouveau projet ou un environnement isole si possible ;
- comparer les donnees avant toute action destructive.

### Incident Storage

Exemples :

- medias Booster disparus ;
- pieces jointes iNrSend manquantes ;
- devis ou factures non telechargeables ;
- logos absents ;
- rapports iNrAgent introuvables.

Point important :

- les backups database Supabase ne restaurent pas les fichiers Storage ;
- il faut une copie externe des fichiers Storage pour restaurer completement.

Action prioritaire :

- identifier le bucket touche ;
- verifier si le fichier existe encore dans Supabase Storage ;
- verifier si la base pointe vers un chemin encore valide ;
- restaurer depuis la sauvegarde externe Storage quand elle existe.

## Procedure de restauration complete

### 1. Restaurer le code source

1. Recuperer l'archive source stable.
2. Verifier son empreinte SHA-256.
3. Dezipper dans un dossier propre.
4. Lancer `npm ci`.
5. Lancer `npm run typecheck`.
6. Lancer `npm run lint`.

Note : le build local peut dependre du reseau pour les polices Google. Si le build local echoue uniquement sur les polices, verifier en Preview Vercel.

### 2. Restaurer les variables d'environnement

1. Recuperer les variables dans Vercel.
2. Recuperer les secrets GitHub Actions si le CI doit tourner.
3. Ne jamais commiter `.env.local`.
4. Verifier les variables requises avec `npm run verify:env`.
5. Comparer avec `STABILISATION_ETAPE_2_CONFIG_2026-06-21.md`.

### 3. Restaurer Supabase Database

1. Identifier le backup a utiliser.
2. Preferer une restauration vers un nouveau projet ou environnement isole.
3. Verifier les tables critiques.
4. Verifier les policies RLS.
5. Verifier les utilisateurs et connexions OAuth.
6. Ne restaurer la production qu'en dernier recours.

### 4. Restaurer Supabase Storage

Buckets critiques :

- `inrbox_attachments`
- `logos`
- `booster`
- `inr-agent-reports`
- `inrcy-image-bank`

Ordre de verification :

1. `inrbox_attachments` : devis, factures, pieces jointes.
2. `logos` : identite visuelle des comptes.
3. `booster` : medias de publication.
4. `inr-agent-reports` : rapports PDF.
5. `inrcy-image-bank` : banque d'images.

Sans sauvegarde externe Storage, une restauration complete n'est pas garantie.

### 5. Restaurer Vercel

1. Verifier que le domaine `app.inrcy.com` est en `Valid Configuration`.
2. Verifier que `inrcy-app.vercel.app` est en `Valid Configuration`.
3. Verifier que la branche production est `main`.
4. Deployer en Preview.
5. Tester les parcours critiques.
6. Promouvoir ou redeployer en Production seulement apres validation.

## Tests critiques avant retour production

- Connexion utilisateur.
- Chargement du dashboard.
- Lecture du profil et du logo.
- Acces aux modules principaux.
- Lecture iNrSend.
- Acces devis/factures existants.
- Acces aux pieces jointes.
- Verification des integrations connectees.
- Generation IA simple sans publication reelle.
- Preparation Booster sans publication reelle.
- Verification des webhooks critiques si concernes.
- Paiement/Stripe seulement en mode controle prudent.

## Actions interdites en urgence

- Supprimer ou modifier des policies RLS sans export SQL.
- Changer les DNS sans copie de l'etat precedent.
- Regenerer tous les secrets sans plan.
- Lancer un restore Supabase production pour tester.
- Rendre un bucket Storage public pour "debloquer vite".
- Modifier les rate limits sans symptome precis.
- Changer plusieurs couches a la fois.

## Apres incident

1. Noter l'heure de debut.
2. Noter l'action qui a corrige.
3. Noter les donnees potentiellement touchees.
4. Ajouter une entree dans la documentation de stabilisation.
5. Creer un test ou une verification pour eviter la repetition.

## Decision actuelle

Au 2026-06-21, l'etat observe est sain :

- code source stable archive ;
- Vercel production valide ;
- DNS `app.inrcy.com` valide ;
- Supabase database sauvegardee ;
- Storage identifie ;
- policies Storage critiques coherentes ;
- procedure de retour arriere documentee.

Le point restant a mettre en place plus tard est une vraie sauvegarde externe de Supabase Storage.
