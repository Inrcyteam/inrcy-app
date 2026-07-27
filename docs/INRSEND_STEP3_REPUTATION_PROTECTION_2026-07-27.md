# iNr'Send - Etape 3 - Protection de la reputation

Cette etape part du ZIP de l'etape 2 et ajoute une couche de protection de la boite d'envoi sans remplacer Gmail, Outlook ou IMAP/OVH.

## Ajouts

- profil de cadence adaptatif par boite et fournisseur ;
- mode chauffe pour une boite nouvelle ou sans historique ;
- mode prudent apres erreurs repetees ;
- pause temporaire apres blocage fournisseur ou plainte ;
- audit DNS SPF, DKIM et DMARC sur les domaines personnalises ;
- conservation des listes de suppression, rebonds durs et plaintes ;
- entetes `List-Unsubscribe` et `List-Unsubscribe-Post` sur Gmail et SMTP/IMAP ;
- prise en charge du POST de desabonnement en un clic ;
- analyse periodique des retours de non-distribution Gmail, Outlook et IMAP ;
- rotation equitable des boites analysees et exclusion des retours deja traites ;
- nouveaux scopes de lecture pour les futures connexions Gmail et Microsoft ;
- endpoint authentifie `/api/inrsend/reputation?accountId=...` pour exposer le diagnostic a la future UI ;
- stockage des retours techniques protege par RLS et reserve au service serveur.

## Comportement de cadence

Les limites de l'etape 1 restent des plafonds. L'etape 3 peut seulement ralentir :

- Gmail/Microsoft en chauffe : 3 mails par tranche, 12 secondes entre les mails, 90 secondes de pause ;
- IMAP/OVH : 4 mails maximum par tranche, 12 secondes entre les mails, 90 secondes de pause ;
- domaine sans SPF ou DMARC confirme : 2 mails par tranche, 15 secondes entre les mails, 120 secondes de pause ;
- boite sous surveillance : 2 mails par tranche, 20 secondes entre les mails, 180 secondes de pause.

## Deploiement

1. conserver les SQL des etapes 1 et 2 ;
2. executer `ops/sql/2026-07-27_inrsend_step3_reputation_protection.sql` ;
3. deployer le ZIP etape 3 ;
4. les connexions Gmail/Microsoft existantes continuent d'envoyer, mais l'analyse automatique des retours sera active apres leur prochaine reconnexion OAuth afin d'obtenir le scope de lecture.
