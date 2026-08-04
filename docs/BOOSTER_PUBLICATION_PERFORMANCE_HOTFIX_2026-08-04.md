# Booster - correctif performance publication - 2026-08-04

## Symptomes corriges

- barre bloquee a 6 %, 24 % ou 25 % pendant les phases media ;
- message de variante video pour une source YouTube compatible choisie en Originale ;
- attente de plusieurs minutes a 98 % / Finalisation dans iNrSend ;
- petite video YouTube telechargee completement en memoire avant le debut du second upload.

## Causes

1. Le client attendait le statut terminal du job asynchrone jusqu'a huit minutes.
2. Un worker interrompu pouvait ne repartir qu'apres le verrou technique de cinq minutes, ce qui produisait un delai visible proche de six minutes.
3. Les videos YouTube de moins de trois minutes etaient forcees silencieusement en 9:16 safe_frame.
4. L'upload YouTube faisait Storage -> Blob Vercel -> YouTube au lieu de diffuser le flux Storage -> YouTube.
5. Le rafraichissement des metriques du dashboard restait dans le chemin bloquant du resultat.

## Nouveau comportement

- grace de suivi rapide de 18 secondes maximum dans l'editeur ;
- si un canal travaille encore, l'editeur est libere et la modale de bilan suit le job durable automatiquement ;
- iNrSend reste la source de suivi persistante ;
- Originale reste Originale sur YouTube ;
- une variante n'est creee qu'apres un choix explicite ou une incompatibilite reelle ;
- le fichier YouTube est streame directement depuis le stockage ;
- les metriques du dashboard se rafraichissent en arriere-plan ;
- progression visuelle douce pendant upload, analyse et controle media.
