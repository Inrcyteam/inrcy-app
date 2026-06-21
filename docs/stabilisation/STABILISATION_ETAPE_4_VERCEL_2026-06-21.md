# Stabilisation iNrCy - Etape 4

Date : 2026-06-21

Objet : documenter le deploiement Vercel production et les domaines attaches.

Regle de l'etape : observation uniquement. Aucun redeploiement, aucun rollback, aucune modification DNS.

## Sources analysees

- Capture Vercel > Deployment details
- Capture Vercel > Settings > Domains
- Documents precedents :
  - `STABLE_SNAPSHOT_2026-06-21.md`
  - `STABILISATION_ETAPE_2_CONFIG_2026-06-21.md`
  - `STABILISATION_ETAPE_3_RESTAURATION_2026-06-21.md`

## Deploiement production observe

Projet Vercel : `inrcy-app`

Team : `inrcyteam`

Deployment visible :

- Identifiant court visible : `BDW1Dha4w`
- Statut : `Ready`
- Marqueur : `Latest`
- Environnement : `Production`
- Marqueur environnement : `Current`
- Cree par : `jwright-5871`
- Creation visible : il y a environ 13 h au moment de la capture
- Duree de build/deploiement : 1 min 8 s
- Branche source : `main`
- Commit visible : `15a1935`
- Message visible : `allez`

Domaines attaches au deploiement :

- `app.inrcy.com`
- `inrcy-app-git-main-inrcyteam.vercel.app`
- `inrcy-emptyt164n-inrcyteam.vercel.app`
- La capture indique aussi `+2` domaines dans le bloc deployment.

Etapes Vercel visibles :

- Provisioning integrations : OK
- Build logs : OK
- Deployment summary : OK
- Assigning custom domains : OK
- Deployment checks : visible, mais detail non ouvert

Observabilite :

- Runtime Logs disponible
- Observability disponible
- Speed Insights : not enabled
- Web Analytics : not enabled

## Domaines Vercel observes

Domaines listes :

- `app.inrcy.com`
  - Environnement : Production
  - Statut visible : `DNS Change Recommended`
- `inrcy-app.vercel.app`
  - Environnement : Production
  - Statut visible : `Valid Configuration`

Interpretation :

- Le domaine principal applicatif `app.inrcy.com` est bien attache a la production.
- Le domaine Vercel natif `inrcy-app.vercel.app` est valide.
- Le message `DNS Change Recommended` sur `app.inrcy.com` n'indique pas forcement une panne, mais il faut comprendre ce que Vercel recommande avant de continuer.
- Ne pas modifier les DNS maintenant sans capture du detail exact.

## Recommandation DNS detaillee

Capture ajoutee ensuite pour `app.inrcy.com`.

Vercel recommande de mettre a jour l'enregistrement DNS suivant :

| Type | Nom | Valeur recommandee |
| --- | --- | --- |
| CNAME | `app` | `bda761de4eb188be.vercel-dns-017.com.` |

Message Vercel observe :

- Cette recommandation est liee a une extension planifiee de plage IP.
- Les anciens enregistrements `cname.vercel-dns.com` et `76.76.21.21` continuent de fonctionner.
- Vercel recommande d'utiliser les nouveaux enregistrements.
- Les changements DNS peuvent prendre du temps a se propager.

Interpretation :

- Ce n'est pas une urgence production.
- Le site peut continuer a fonctionner avec l'ancien DNS.
- La modification est probablement saine a faire plus tard, mais elle doit etre faite avec prudence chez le fournisseur DNS.
- Avant toute modification, il faut capturer l'enregistrement DNS actuel de `app.inrcy.com`.

## Ce qui est sain

- Il existe un deploiement production courant et pret.
- Le deploiement vient de la branche `main`.
- Le commit visible est identifie.
- Les domaines production sont attaches.
- Le domaine Vercel natif est valide.
- Les etapes principales du deploiement sont marquees OK.

## Points a verifier sans modifier

- Capturer l'enregistrement DNS actuel de `app.inrcy.com` chez le fournisseur DNS.
- Ouvrir `Deployment Settings` pour voir la recommandation affichee sur le deploiement.
- Ouvrir `Deployment Checks` pour voir s'il y a un controle incomplet ou simplement non configure.
- Confirmer si `app.inrcy.com` est le domaine principal attendu cote Supabase Auth et Vercel env.

## Points a ne pas changer maintenant

- Ne pas faire de rollback.
- Ne pas redeployer.
- Ne pas changer le domaine principal.
- Ne pas modifier les DNS chez le registrar sans copie de l'etat actuel et sans fenetre de verification.
- Ne pas activer Speed Insights ou Web Analytics sans decision produit/cout/confidentialite.
- Ne pas changer la branche de production.

## Utilite pour la restauration

En cas de besoin de retour arriere, ce deploiement donne une reference :

- source branche : `main`
- commit : `15a1935`
- deployment courant : `BDW1Dha4w`
- domaine production : `app.inrcy.com`

Procedure prudente en cas d'incident futur :

1. Ne pas toucher directement au domaine.
2. Identifier le dernier deploiement production stable dans Vercel.
3. Comparer avec l'archive source stable de l'etape 1.
4. Verifier les variables d'environnement Vercel.
5. Verifier Supabase avant tout rollback.
6. Restaurer d'abord en Preview si possible.
7. Promouvoir ou rediriger en production seulement apres validation des parcours critiques.

## Decision

L'etat Vercel est globalement sain. Le message `DNS Change Recommended` sur `app.inrcy.com` est maintenant compris : Vercel recommande un CNAME plus recent.

La prochaine etape zero risque est de capturer l'etat DNS actuel chez le fournisseur DNS, puis de finaliser une procedure de restauration complete.

## Etat DNS actuel OVH

Capture OVH ajoutee ensuite pour la zone DNS `inrcy.com`.

Enregistrement observe :

| Sous-domaine | Type | Cible actuelle | TTL |
| --- | --- | --- | --- |
| `app` | CNAME | `cname.vercel-dns.com.` | Par defaut |

Interpretation :

- `app.inrcy.com` pointe deja vers Vercel avec l'ancien CNAME.
- La mise a jour recommandee par Vercel consiste a modifier uniquement la cible de cette ligne.
- Ne pas toucher aux entrees mail, SPF, DMARC, NS, ni a l'entree racine `@`.

Action DNS possible :

- Remplacer `cname.vercel-dns.com.` par `bda761de4eb188be.vercel-dns-017.com.` sur l'enregistrement CNAME `app`.
- Garder le type `CNAME`.
- Garder le sous-domaine `app`.
- Garder le TTL par defaut.

## Validation apres mise a jour DNS

Capture Vercel ajoutee apres modification DNS.

Etat observe :

- `app.inrcy.com` : `Valid Configuration`
- `inrcy-app.vercel.app` : `Valid Configuration`
- Les deux domaines sont associes a l'environnement Production.

Interpretation :

- La recommandation DNS Vercel a ete traitee.
- Vercel ne signale plus `DNS Change Recommended` pour `app.inrcy.com`.
- L'etat domaine production est sain.
