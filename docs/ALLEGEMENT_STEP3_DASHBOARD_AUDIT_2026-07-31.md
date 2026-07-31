# Allegement - Etape 3 - Audit Dashboard sans risque

Date : 31 juillet 2026

## Perimetre strict

Cette etape est volontairement limitee a un audit de `app/dashboard/DashboardClient.tsx`.

Aucune extraction, aucun deplacement de fonction, aucun import et aucune logique applicative n'ont ete modifies. Le seul fichier ajoute est le present rapport.

## Archive controlee

- SHA-256 de l'archive d'entree : `28f39f21bfb6227f0c981c33c9f0970637c78124611c582b16ec4cee60a84156`
- Taille de l'archive d'entree : `8601657` octets
- Fichier principal audite : `app/dashboard/DashboardClient.tsx`
- SHA-256 du fichier audite : `069583fe00ae148399f4de90bf979c3e6e3175fc7535544c9d1d1efec4341c26`

## Cartographie

- Taille de `DashboardClient.tsx` : 4 077 lignes
- Debut du composant React : ligne 435
- Zone de fondations avant le composant : 434 lignes
- Imports : 55
- Constantes top-level avant le composant : 13
- Types top-level avant le composant : 7
- Fonctions top-level avant le composant : 28

La zone initiale contient principalement les cles et helpers de cache du Dashboard, le dernier etat connu des canaux, la puissance du generateur, les acces aux bulles, le profil iNrBadge et la progression Site iNrCy / Site Web.

## Protections confirmees

### Acces Site iNrCy ferme par defaut

Le cache navigateur ne peut pas accorder l'acces fonctionnel a Site iNrCy :

- `createUnverifiedBubbleAccessMap()` force `site_inrcy = false` ;
- `readCachedBubbleAccessMap()` force egalement `site_inrcy = false` avant la reponse autoritaire ;
- `readCachedSiteInrcyDisplayAccess()` ne sert qu'a la continuite visuelle ;
- les actions restent bloquees tant que l'API autoritaire n'a pas confirme l'acces.

### Demarrage stable avec le dernier etat connu

Les etats sensibles sont initialises avec des fonctions paresseuses `useState(() => ...)`, notamment :

- acces visuel Site iNrCy ;
- nombre de comptes mails connectes ;
- YouTube Shorts, Pinterest et iNrSearch ;
- profil iNrBadge ;
- activation et puissance du generateur ;
- progression des bulles Site ;
- blocs statistiques par canal ;
- carte d'acces aux bulles.

Cela evite un faux retour visuel a zero pendant l'hydratation.

### Caches tolerants aux erreurs

Les lectures et ecritures de cache sont protegees par `try/catch`. Un cache absent, ancien ou malforme ne doit pas casser l'ouverture du Dashboard.

Le compteur de comptes mails ne reutilise le cache iNrStats que si son horodatage est valide et age de moins de sept jours.

### Aucun effet reseau dans la zone auditee

Aucun appel `fetch`, Supabase ou creation de client n'est execute dans les 434 lignes de fondations avant le composant.

## Pourquoi aucune extraction n'est realisee

Une extraction serait techniquement possible, mais elle ne respecte pas le niveau « sans risque » demande pour cette serie :

1. dix fichiers de tests lisent directement le texte de `DashboardClient.tsx` et verifient que certains contrats y restent presents ;
2. deplacer les helpers ferait echouer ces tests meme avec un comportement runtime identique ;
3. la zone contient des contrats de securite fail-closed, d'hydratation et de cache multicompte ;
4. `useBrowserLayoutEffect` et l'origine publique iNrSearch ont une semantique navigateur / SSR sensible ;
5. plusieurs helpers s'appellent entre eux et partagent les memes cles de cache.

Verdict : ne rien extraire dans cette etape est la decision la plus sure.

## Tests executes sur le perimetre

- Dashboard : 86 / 86
- Onboarding et verrouillage : 36 / 36
- Multicompte : 54 / 54
- Bubble Access : 7 / 7
- Stabilite mobile Dashboard : 3 / 3

Total cible : 186 tests reussis, 0 echec.

## Audits transverses

Les 12 audits suivants ont reussi :

- multicompte ;
- AI Gateway ;
- pipeline media, etapes 1 a 10.

## Limites de certification

Le lint, le typecheck et le build necessitent l'installation complete des dependances. Ils restent a confirmer par la CI, comme lors de l'Etape 2. Aucun fichier TypeScript ou applicatif n'ayant ete modifie, cette limite ne cree pas de nouveau risque propre a l'Etape 3.

## Garantie de modification

A l'issue de cette etape :

- aucun fichier de code n'a ete modifie ;
- aucun import n'a ete modifie ;
- aucun asset n'a ete supprime ;
- aucun comportement applicatif n'a ete change ;
- seul ce rapport d'audit a ete ajoute.
