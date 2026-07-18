# iNrCy Ops Runbook

Runbook minimal pour exploiter iNrCy en production sans casser la version stable.

## Liens clés

- Vercel → Deployments / Logs
- Supabase → Database / Logs / Query Performance / Backups
- Sentry → Issues / Performance
- Upstash / Vercel KV → usage / latence / disponibilité
- Stripe → Webhooks / logs paiements

## Health checks

Public :

```txt
GET /api/health
```

Interne :

```txt
GET /api/health/internal
header: x-health-token: $HEALTHCHECK_TOKEN
```

Cron :

```txt
GET /api/cron/health
bearer / secret: $VERCEL_CRON_SECRET
```

Si le health interne retourne `503`, vérifier dans cet ordre :

1. Supabase ;
2. Upstash / KV ;
3. Stripe ;
4. SMTP ;
5. variables Vercel ;
6. dernier déploiement.

## Triage incident en 5 minutes

1. Déterminer si le problème est global ou limité à un client.
2. Récupérer l'heure exacte et, si possible, un `x-request-id`.
3. Vérifier Vercel Logs et Sentry.
4. Identifier la surface : auth, DB, KV, OAuth, OpenAI, mails, publication, Stripe.
5. Décider : rollback immédiat, hotfix, ou attente fournisseur.

## Incidents fréquents

### A. Spike 500 / 503

1. Vercel Logs : filtrer les statuts 5xx.
2. Sentry : regarder la dernière issue active.
3. Supabase : vérifier Query Performance et connexions.
4. Si le problème suit un déploiement récent : rollback Vercel.

### B. OAuth callbacks en erreur

1. Vérifier que la redirect URI du provider correspond au domaine actuel.
2. Vérifier les variables `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI`.
3. Vérifier les erreurs de `state` / cookies / domaine.
4. Ne pas modifier une app en review sans noter précisément le changement.

### C. Upstash / KV indisponible

L'application utilise KV pour rate limiting et quotas.

Booster Generate reste en fail-closed pour éviter une génération IA sans garde économique. Les crédits IA sont suivis uniquement à la semaine et au mois. Booster Publish est plafonné à cinq publications immédiates par compte et par jour pour l'anti-abus ; Microsoft Send et Booster Publish basculent sur une limite locale d'urgence afin de rester disponibles si KV tombe. Les autres endpoints doivent être vérifiés selon leur configuration propre.

Conséquence :

- Microsoft Send et Booster Publish restent disponibles avec une limite de secours ;
- la limite de secours n'est pas globale entre toutes les instances Vercel, donc Redis doit rester la référence dès que possible.

Actions :

1. Vérifier Upstash / Vercel KV.
2. Surveiller les endpoints IA et publication.
3. Surveiller les coûts OpenAI et volumes de publication.
4. Si abus réel : baisser temporairement les quotas via env ou désactiver le flux concerné avec une hotfix ciblée.
5. Ne pas supprimer les protections pour contourner un quota Upstash ; corriger d'abord la connexion et le plan du compte.

### D. OpenAI / IA indisponible ou coûteuse

1. Vérifier erreurs API et quotas OpenAI.
2. Vérifier `AI_GATEWAY_API_KEY`/OIDC et les modèles Gateway : texte, vision et transcription brute passent tous par Vercel AI Gateway.
3. Surveiller les endpoints de génération / transcription.
4. En cas de dérive coût : réduire les quotas ou couper temporairement le module concerné.

### E. DB latency / timeouts

1. Supabase Query Performance : identifier la requête lente.
2. Vérifier si un cron ou une campagne mail crée une charge.
3. Ajouter index / pagination / réduction payload si nécessaire.
4. En urgence : rollback ou hotfix ciblée.

### F. Mails / iNrSend

1. Vérifier SMTP transactionnel.
2. Vérifier les webhooks iNrSend si concernés.
3. Vérifier les limites horaires / journalières.
4. Vérifier la boîte d'envoi du client si IMAP / SMTP personnel.

### G. TikTok / Pinterest / Trustpilot en attente

Pendant la phase de review ou d'accès incomplet :

1. Ne pas forcer les variables manquantes en CI stricte.
2. Ne pas supprimer les routes de callback / pages de validation.
3. Ne pas modifier les scopes sans raison.
4. Garder une trace des vidéos / screenshots envoyés aux plateformes.
5. Tester seulement les flows disponibles.

## Rollback process

1. Vercel → Deployments.
2. Sélectionner le dernier déploiement stable connu.
3. Redeploy.
4. Vérifier `/api/health` et login réel.
5. Si une migration DB est déjà appliquée, faire une forward-fix migration plutôt qu'un rollback SQL risqué.

## Post-incident

Noter :

- date / heure ;
- impact ;
- cause probable ;
- correction ;
- prévention ;
- test ou alerte à ajouter.

## Règles de prudence

Ne pas faire directement en production sans Preview :

- refactor massif ;
- CSP stricte ;
- changement d'accès admin ;
- changement OAuth soumis en review ;
- passage global en fail-closed ;
- migration Supabase non testée ;
- changement global UI / responsive.
