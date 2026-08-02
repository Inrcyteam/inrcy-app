# Correctif Pinterest carrousel et erreurs en français — 02/08/2026

## Cause de l’échec Pinterest

L’API Pinterest refuse une épingle `multiple_image_urls` lorsque les images n’ont pas exactement le même ratio largeur/hauteur. Le pipeline iNrCy conservait volontairement le ratio original de chaque média ; un mélange portrait, carré et paysage pouvait donc provoquer l’erreur `Pinterest Images must have the same width/height ratios`.

## Correction appliquée

La préparation Pinterest est maintenant centralisée et protégée à deux niveaux :

1. le préparateur média commun crée, pour Pinterest uniquement, une séquence au ratio identique lorsque le carrousel contient des formats différents ;
2. `createPinterestImagePin` applique un dernier contrôle serveur partagé par Booster, iNrAgent, les programmations, les nouvelles tentatives et les modifications iNrSend.

Règles de rendu :

- une image seule reste originale ;
- plusieurs images déjà au même ratio restent originales ;
- un carrousel aux ratios différents reprend le ratio de la première image ;
- si la première image est plus haute que le ratio Pinterest 2:3, la séquence est ramenée à 2:3 ;
- un recadrage léger est autorisé uniquement lorsque la perte calculée ne dépasse pas 8 % ;
- au-delà, l’image est placée intégralement sur un fond noir uni ;
- aucun fond flouté n’est utilisé ;
- les originaux et les rendus des autres canaux ne sont pas modifiés.

Les variantes harmonisées sont enregistrées dans le bucket public `booster`, sous un chemin déterministe versionné, puis leurs URL sont transmises à Pinterest. Le résultat de publication indique également si une harmonisation a été appliquée et les dimensions finales utilisées.

## Messages d’erreur en français

Un normaliseur commun protège désormais les surfaces de publication :

- erreurs Pinterest et TikTok connues traduites avec un message actionnable ;
- erreurs fournisseur inconnues en anglais remplacées par un message français sûr ;
- protection dans le diagnostic serveur, le résultat immédiat de publication et l’historique iNrSend ;
- avertissements et motifs de blocage affichés dans la modale finale protégés contre les messages anglais bruts ;
- le motif TikTok lié aux URL non vérifiées précise que le comportement est normal depuis localhost.

Le message technique brut reste disponible uniquement dans les propriétés internes des erreurs Pinterest lorsque le code en a besoin pour reconnaître les restrictions d’édition ; il n’est pas affiché au professionnel.

## Validation

Contrôles exécutés avec succès :

- Pinterest : 19 tests réussis ;
- décisions et architecture images Booster : 18 + 27 tests réussis ;
- iNrSend : 51 tests réussis ;
- Dashboard : 109 tests réussis ;
- architecture média original-first : 3 tests réussis ;
- publication étape 7 : audit 9/9 et 6 tests réussis ;
- publication étape 8 : audit 13/13 et 6 tests réussis ;
- optimisation publication : audit 13/13 et 5 tests réussis ;
- vérification syntaxique TypeScript sur tous les fichiers modifiés et vérification syntaxique JavaScript sur les audits concernés.

Le `typecheck` complet n’a pas pu être relancé dans l’environnement d’audit, car l’installation des dépendances a été bloquée par le registre npm interne puis par la résolution DNS externe. Les suites ciblées, audits d’architecture et validations syntaxiques sont toutes passées.
