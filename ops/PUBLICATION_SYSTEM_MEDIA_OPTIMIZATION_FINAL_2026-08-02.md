# Optimisation finale médias — qualité, poids et vitesse

## Objectif

Conserver la source privée jusqu’à 300 Mo, mais ne jamais envoyer inutilement une vidéo lourde ou une image surdimensionnée aux canaux.

## Vidéos

- décision fondée sur le poids, la durée, la résolution et le débit moyen ;
- remux seulement si la source est déjà efficace ;
- sinon H.264 CRF 21, preset veryfast et débit de pointe adapté à la résolution ;
- si le gain réel est inférieur à 8 %, retour au remux afin d’éviter une perte inutile ;
- Google Business conserve sa variante dédiée ;
- cache des variantes de canal porté à la version 6.

## Images

- original privé conservé ;
- JPEG de publication MozJPEG haute qualité (87) ;
- PNG transparents conservés avec compression maximale sans perte ;
- aperçu IA baseline conservé pour la compatibilité ;
- cache des variantes de canal porté à la version 6.

## Obsolète supprimé

- ancien fast-path basé uniquement sur « moins de 299 Mo » ;
- seuil ultrafast de 80 Mo ;
- débit vidéo ABR fixe `-b:v` sur les variantes de canal ;
- assertions qui imposaient qu’une vidéo 220 Mo reste à 220 Mo.

## Mesures réelles de contrôle

- source vidéo synthétique surdimensionnée : 29 929 313 octets ;
- canonique optimisé : 6 145 212 octets ;
- économie mesurée : 79,5 % ;
- sortie : H.264, CRF 21, preset veryfast, sans avertissement ;
- vidéo déjà efficace : remux sans réencodage vidéo ;
- JPEG synthétique : 449 503 vers 71 897 octets avec MozJPEG ;
- PNG transparent : alpha préservé, compression sans perte.

## Certification

- audit optimisation : 13/13 ;
- tests ciblés croisés : 35/35 ;
- dashboard : 109/109 ;
- certification média complète : 373/373 ;
- TypeScript complet : validé ;
- lint des fichiers modifiés : zéro erreur, zéro avertissement.

Le lint global du dépôt dépasse la fenêtre d'exécution de l'environnement sans produire d'erreur. Le build Next est bloqué avant lecture du code par l'absence du paquet natif SWC Linux dans le registre d'audit ; Vercel/CI doit reconstruire les dépendances avec `npm ci`.
