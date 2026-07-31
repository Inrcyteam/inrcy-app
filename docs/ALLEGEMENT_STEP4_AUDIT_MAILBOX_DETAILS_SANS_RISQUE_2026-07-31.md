# Allegement - Etape 4 - Audit MailboxDetailsModal sans risque

Date: 2026-07-31

## Regle appliquee

Cette etape est un audit pur. Aucun fichier applicatif, aucun import, aucun composant, aucun asset et aucune logique n'ont ete modifies.

## Perimetre analyse

Fichier principal:

- `app/dashboard/mails/_components/MailboxDetailsModal.tsx`
- 2 472 lignes
- 152 750 octets
- composant React a partir de la ligne 391
- zone avant composant: imports, 2 types et 17 fonctions utilitaires

## Fonctions presentes avant le composant

- suivi et libelles de campagne
- formatage du poids et de la duree video
- comparaison et libelle des pieces jointes video
- formatage des erreurs visibles
- extraction des URL et identifiants TikTok
- interpretation des statuts TikTok
- detection de la cible de polling automatique TikTok
- extraction des URL YouTube Shorts ou videos

## Pourquoi aucune extraction n'est realisee

Le deplacement de ces fonctions necessiterait de creer un nouveau module et de modifier les imports. Cette operation serait a faible risque, mais elle ne serait pas sans risque.

Plusieurs contrats sont en outre verifies directement dans le texte du fichier actuel:

- `isCampaignFinishedStatus` et le suivi automatique des campagnes
- `getTiktokAutoPollTarget` et le polling TikTok
- l'annulation d'une publication TikTok en attente
- les statuts TikTok annules, bloques ou en erreur
- la conservation des cinq images Google Business dans iNrSend
- la distinction Originale / Personnalisee lors de la reprise d'une publication

Quatre fichiers de tests lisent directement `MailboxDetailsModal.tsx`. Deplacer certains contrats casserait donc la certification existante, meme si le comportement runtime restait equivalent.

## Decision

- aucune extraction autorisee dans le chantier strictement sans risque
- aucun changement dans `MailboxDetailsModal.tsx`
- aucun changement dans `MailboxClient.tsx`
- aucun changement TikTok, YouTube, Google Business, campagnes ou pieces jointes
- le fichier reste une cible possible d'une future refactorisation a faible risque, mais pas d'un allegement zero risque

## Certification executee

Tests directement et largement lies au perimetre:

- iNrSend: 31 tests reussis
- TikTok: 8 tests reussis
- matrice et integration images Booster/iNrSend: 42 tests reussis
- total des suites larges: 81 tests reussis sur 81

Audits transverses:

- AI Gateway
- multicompte
- pipeline media principal
- pipeline media etapes 2 a 10
- total: 12 audits reussis sur 12

## Conclusion

L'etape 4 certifie que `MailboxDetailsModal.tsx` ne doit pas etre decoupe dans une serie annoncee comme strictement sans risque. Le seul ajout de cette etape est le present rapport d'audit.
