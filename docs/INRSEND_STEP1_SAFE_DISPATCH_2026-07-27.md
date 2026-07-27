# iNr'Send - Etape 1 : securisation du moteur de campagne

## Objectif

Eviter les rafales d'envoi et les chevauchements de cron qui peuvent faire bloquer une boite Gmail, Outlook ou IMAP/SMTP.

## Changements appliques

- 5 destinataires maximum par tranche de travail, au lieu de 50.
- 8 secondes d'attente entre deux appels au fournisseur.
- 60 secondes de refroidissement apres chaque tranche avant de rendre les destinataires suivants eligibles.
- Plafonds par defaut ramenes a 150 envois sur 1 heure et 300 sur 24 heures par boite.
- Verrou distribue Supabase par `integration_id` : une seule execution et une seule campagne peuvent utiliser une boite a la fois, meme si deux cron Vercel se chevauchent.
- Renouvellement du verrou avant chaque destinataire et arret de securite si le verrou est perdu.
- Les campagnes de boites differentes peuvent etre traitees en parallele, sans ralentir tous les professionnels entre eux.
- Les campagnes creees par iNrAgent restent en file et sont prises en charge par le cron mail dedie, afin de ne jamais contourner la cadence.
- Arret immediat de la tranche sur erreur d'authentification, quota, limitation ou indisponibilite fournisseur.
- Verification de la liste `accepted/rejected` renvoyee par Nodemailer pour les boites IMAP/SMTP.
- Les destinataires reclames mais pas encore tentes sont remis proprement en file d'attente sans consommer une tentative.

## Migration obligatoire

Executer avant le deploiement :

`ops/sql/2026-07-27_inrsend_step1_safe_dispatch.sql`

Sans cette migration, le moteur refuse de lancer une campagne et affiche une erreur explicite. Ce comportement est volontaire : il vaut mieux ne rien envoyer que risquer un double envoi.

## Variables facultatives

```env
INRSEND_CAMPAIGN_BATCH_SIZE=5
INRSEND_CAMPAIGN_DELAY_MS=8000
INRSEND_CAMPAIGN_BATCH_PAUSE_MS=60000
INRSEND_CAMPAIGN_HOURLY_LIMIT=150
INRSEND_CAMPAIGN_DAILY_LIMIT=300
INRSEND_CAMPAIGN_MAX_ACTIVE_PER_BOX=1
INRSEND_CAMPAIGN_LOCK_LEASE_SECONDS=180
```

Les valeurs ci-dessus sont deja les valeurs par defaut du code. Il n'est pas obligatoire de les ajouter dans Vercel.

## Duree indicative

Avec le cron actuel chaque minute, une boite traite en pratique une tranche de 5, saute le cron suivant pendant le refroidissement, puis reprend. Le debit prudent vise environ 150 destinataires par heure et une campagne de 300 destinataires autour de 2 heures, selon le temps de reponse du fournisseur.
