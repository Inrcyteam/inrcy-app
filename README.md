# iNrCy App

Application SaaS iNrCy pour piloter la communication, les campagnes, les avis, les statistiques, les documents commerciaux et l'automatisation iNr'Agent.

Ce dépôt contient l'application Next.js principale : dashboard client, modules Booster / Propulser / Fidéliser / iNrSend / iNrStats / iNrCalendar / Devis-Factures / E-réputation / iNr'Badge / iNr'Agent, ainsi que les intégrations OAuth et les routes API associées.

## État de stabilité

Cette version est une base stable en attente de validations plateformes externes : TikTok, Pinterest et Trustpilot.

Règle de travail actuelle : ne pas modifier le comportement métier tant que les validations plateformes sont en cours, sauf correction ciblée et testée.

À privilégier pendant cette phase :

- documentation ;
- checklists de déploiement ;
- vérification des variables d'environnement ;
- sauvegardes Supabase ;
- tests de non-régression ;
- corrections isolées sans refactor massif.

À éviter sans Preview complète :

- refactor des gros fichiers métier ;
- durcissement CSP brutal ;
- changement des accès admin ;
- passage global des limites coûteuses en fail-closed ;
- modification des flows OAuth déjà en review ;
- changement visuel global.

## Stack

- Next.js App Router
- TypeScript
- Supabase
- Stripe
- Vercel
- Upstash / Vercel KV
- Sentry
- Playwright
- OAuth multi-canaux : Google, Meta, LinkedIn, Microsoft, TikTok, Pinterest, Trustpilot selon disponibilité

## Installation locale

```bash
npm ci
npm run dev
```

Puis ouvrir :

```txt
http://localhost:3000
```

Pour un zip de transmission ou d'audit, ne pas inclure :

```txt
node_modules
.next
.env
.env.local
```

Le fichier `package-lock.json` suffit pour réinstaller les dépendances.

## Commandes utiles

```bash
npm run typecheck
npm run lint
npm run test:media-rules
npm run test:multicompte
npm run build
```

Tests E2E :

```bash
npm run test:e2e:install
npm run test:e2e
```

Tests E2E contre une URL déployée :

```bash
E2E_BASE_URL=https://app.inrcy.com npm run test:e2e
```

Tests authentifiés optionnels :

```bash
E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e
```

## Variables d'environnement

La liste de suivi est dans :

```txt
docs/ENVIRONMENT_CHECKLIST.md
```

Le script de vérification est :

```bash
npm run verify:env
```

En local ou en CI non bloquante :

```bash
STRICT=0 npm run verify:env
```

En CI stricte, à activer seulement quand toutes les variables Production / Preview sont disponibles :

```bash
STRICT=1 npm run verify:env
```

Important : tant que TikTok, Pinterest et Trustpilot ne sont pas complètement validés / disponibles, garder le check env en non-strict est acceptable.

## Rate limiting et quotas

L'application utilise Upstash / Vercel KV pour les limites et quotas.

Variables principales :

```txt
KV_REST_API_URL
KV_REST_API_TOKEN
```

Variables de tuning possibles :

```txt
RL_BOOSTER_GENERATE_PER_MIN
RL_TEMPLATES_RENDER_PER_MIN
QUOTA_TEMPLATES_RENDER_PER_DAY
RL_PUBLISH_NOW_PER_MIN
QUOTA_PUBLISH_NOW_PER_DAY
RL_WIDGET_ISSUE_TOKEN_PER_MIN
QUOTA_WIDGET_ISSUE_TOKEN_PER_DAY
```

État actuel documenté : certains endpoints coûteux sont configurés en fail-open côté code pour éviter de bloquer les utilisateurs si KV / Upstash est indisponible.

C'est un choix de continuité de service. Le passage en fail-closed est une amélioration sécurité/coûts à tester en Preview, car il peut bloquer la génération IA ou la publication en cas d'incident KV.

## Build et polices

Le projet utilise `next/font` pour Geist. En local, un build peut échouer si l'environnement bloque le téléchargement des polices Google / Vercel.

Si cela arrive uniquement en local avec une erreur réseau / TLS, ce n'est pas forcément une erreur applicative. Le build Vercel reste la référence.

Une amélioration future possible est le self-host des polices, mais cela doit passer par Preview car le rendu visuel peut légèrement changer.

## Déploiement

Checklists principales :

```txt
ops/DEPLOY_CHECKLIST.md
ops/RUNBOOK.md
ops/MIGRATIONS.md
```

Ordre recommandé avant production :

1. créer une version stable / tag Git ;
2. vérifier les variables Vercel Production et Preview ;
3. vérifier les migrations Supabase ;
4. lancer typecheck / lint / tests ciblés ;
5. déployer en Preview ;
6. tester les flows critiques ;
7. promouvoir en Production ;
8. vérifier logs, Sentry et health checks.

## Health checks

Public :

```txt
GET /api/health
```

Interne :

```txt
GET /api/health/internal
header: x-health-token: <HEALTHCHECK_TOKEN>
```

Smoke check :

```bash
APP_BASE_URL=https://app.inrcy.com HEALTHCHECK_TOKEN=... npm run smoke:health
```

## CI GitHub Actions

Workflow :

```txt
.github/workflows/ci.yml
```

État actuel :

- lint ;
- build ;
- E2E si secrets disponibles ;
- verify-env en non-strict.

À faire plus tard, quand toutes les variables plateformes sont stabilisées : passer `STRICT=1` sur `main`.

## Migrations Supabase

Avant d'ajouter ou modifier une migration :

1. vérifier `ops/MIGRATIONS.md` ;
2. tester en Preview / staging ;
3. noter l'ordre d'application ;
4. prévoir un rollback logique ou une forward-fix migration.

Ne jamais lancer une migration non testée directement en production.

## Règles média actuelles

- Images : jusqu'à 5 images, 40 Mo total.
- Vidéo source : 1 vidéo, jusqu'à 100 Mo.
- Publication optimisée : jusqu'à 40 Mo.

Ces règles doivent rester alignées entre :

```txt
lib/mediaRules.ts
docs / textes légaux
UI Booster / Publier
routes de publication
```

## Phase actuelle recommandée

Cette version doit surtout servir de socle stable.

Priorité basse casse :

```txt
README / docs / checklists
variables Vercel
sauvegardes Supabase
tests de non-régression
attente validations TikTok / Pinterest / Trustpilot
```

Priorité à reporter après validations ou Preview dédiée :

```txt
refactor gros fichiers
CSP stricte
fail-closed global
centralisation admin
self-host polices
nouveaux gros modules
```

## iNr'Search — génération de prospects

La page publique iNr'Search contient un formulaire de demande directement relié à iNrCRM. Une demande valide :

- ajoute ou actualise le contact sans doublon ;
- crée une notification dans l'application ;
- envoie un email transactionnel au professionnel lorsque SMTP est configuré ;
- remonte comme contact généré dans iNrStats.
