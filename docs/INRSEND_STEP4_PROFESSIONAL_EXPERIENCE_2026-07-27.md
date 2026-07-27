# iNr'Send - Etape 4 - Experience professionnelle

Cette etape part du ZIP de l'etape 3 et finalise l'experience de suivi des campagnes.

## Ajouts

- progression en pourcentage et barre de suivi dans le detail d'une campagne ;
- estimation de la duree et de l'heure de fin selon la cadence reelle de la boite ;
- actualisation automatique du suivi pendant l'envoi ;
- bilan de campagne persistant en base, consultable meme si le mail de bilan echoue ;
- suivi du mail de bilan : en attente, envoye, ignore ou en echec ;
- bouton de renvoi manuel du bilan ;
- compteurs plus precis : accepte par le fournisseur, livre confirme, rebond dur, rebond temporaire, desinscription et blocage ;
- message de lancement indiquant la duree estimee ;
- tests de calcul pour 20, 200 et 300 destinataires et controle structurel de l'etape 4.

## Deploiement

1. conserver les SQL des etapes 1, 2 et 3 ;
2. executer `ops/sql/2026-07-27_inrsend_step4_professional_experience.sql` ;
3. deployer le ZIP etape 4 ;
4. ouvrir une campagne dans iNrSend pour verifier la progression et le bilan persistant.
