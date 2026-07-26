# Correction racine Supabase 400 / 403 / 5xx

## Storage 400 — logos

Les logos ne sont plus affiches avec une URL signee Supabase expirante stockee en base.
L'application conserve le chemin `logo_path` et sert le fichier via une URL stable :
`/api/public/logo?path=...`.

Effets :
- suppression des GET vers d'anciennes URLs `/storage/v1/object/sign/logos/...` ;
- plus d'expiration de token cote navigateur ou robot ;
- cache HTTP gere par l'application ;
- compatibilite avec les anciennes valeurs `logo_url` signee pour recuperer leur chemin.

## Auth 403

Le proxy valide la session avant le rendu et avant les routes API.
Une session invalide :
- est arretee avant les appels metier ;
- voit ses cookies Supabase expires supprimes ;
- recoit une reponse 401 structuree pour les API ou une redirection vers `/login`.

Dans le navigateur, les appels concurrents `auth.getUser()` sont regroupes en une seule requete.
Le premier 401/403 invalide la session locale et evite la tempete de requetes paralleles.

## Storage 5xx / 504 lors de la signature

La signature est centralisee dans `lib/safeStorageSignedUrl.ts` :
- aucune liste de dossier avant signature ;
- mutualisation des requetes simultanees pour le meme objet ;
- cache serveur avec marge avant expiration ;
- aucun retry sur 400/404 deterministes ;
- retries progressifs uniquement sur timeout, 429 et 5xx ;
- echec explicite si Supabase reste indisponible apres les tentatives.

Un incident reel de la plateforme Supabase peut toujours produire un 5xx ponctuel, mais il ne declenche plus de rafale de signatures et l'application effectue une reprise bornee et coherente.
