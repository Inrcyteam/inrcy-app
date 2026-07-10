# AI Gateway — Étape 5 — Garde-fous économiques

Date : 2026-07-10

## Objectif

Empêcher qu'une action utilisateur, un retry réseau, un moteur non prévu ou une récupération qualité multiplie silencieusement les coûts IA.

## 1. Allowlist modèles

Par défaut, seuls les 8 modèles reliés au sélecteur Configuration IA sont autorisés :

- `openai/gpt-4o-mini`
- `anthropic/claude-3.5-haiku`
- `google/gemini-2.5-flash-lite`
- `mistral/mistral-medium-3.5`
- `xai/grok-4.1-fast-non-reasoning`
- `perplexity/sonar`
- `deepseek/deepseek-v3.2`
- `meta/llama-4-maverick`

Une extension volontaire est possible avec `AI_GATEWAY_ALLOWED_MODELS`, liste séparée par virgules/espaces/points-virgules. Ne pas utiliser cette variable sans QA du modèle.

## 2. Politique par fonctionnalité

`lib/aiGatewayPolicy.ts` fixe pour chaque feature :

- sortie maximale ;
- retries maximaux ;
- timeout maximal ;
- taille maximale du prompt ;
- nombre maximal d'images ;
- volume maximal des data URLs ;
- budget maximal d'une opération multi-appels.

Les retries fournisseur sont plafonnés à 1 maximum. Les analyses de pièces jointes et le nettoyage de transcription sont à 0 retry automatique.

## 3. Budget partagé d'une action utilisateur

Booster et iNrAgent Publier partagent un budget entre batchs, reprises qualité, récupérations canal unique et sauvetage YouTube.

Valeurs par défaut :

- Booster : 8 sous-appels maximum, 42 000 tokens de sortie réservés maximum, 180 s ;
- iNrAgent Publier : 7 sous-appels maximum, 38 000 tokens réservés maximum, 180 s ;
- Templates / Campagnes : 2 appels maximum, 5 500 tokens réservés maximum, 90 s.

Le budget compte les appels logiques même lorsqu'un appel échoue. Cela empêche les boucles de récupération de devenir illimitées.

## 4. Garde-fou par établissement actif

Tous les appels `aiGenerateJSON` portent maintenant `accountId` correspondant à l'établissement actif.

`lib/aiGatewayAccountGuard.ts` utilise Upstash pour compter les vraies tentatives HTTP et les tokens retournés.

Valeurs par défaut sans variable supplémentaire :

- 300 tentatives Gateway / établissement / jour ;
- 250 000 tokens de sortie / établissement / jour ;
- 6 000 tentatives / établissement / mois ;
- 5 000 000 tokens de sortie / établissement / mois.

Variables optionnelles :

- `AI_GATEWAY_MAX_CALLS_PER_ACCOUNT_DAY`
- `AI_GATEWAY_MAX_OUTPUT_TOKENS_PER_ACCOUNT_DAY`
- `AI_GATEWAY_MAX_CALLS_PER_ACCOUNT_MONTH`
- `AI_GATEWAY_MAX_OUTPUT_TOKENS_PER_ACCOUNT_MONTH`

Les tentatives réelles sont comptées via le hook `onAttempt` de `fetchWithRetry`, donc un retry HTTP est bien visible économiquement.

## 5. Télémétrie d'usage

Après une réponse réussie, iNrCy extrait quand disponibles :

- input tokens ;
- output tokens ;
- total tokens.

Les compteurs sont agrégés dans Upstash par établissement, jour, mois, feature et modèle. Une panne de télémétrie ne casse jamais une réponse IA déjà valide.

## 6. Quotas crédits multicompte

Les quotas existants restent par défaut :

- 60 crédits / jour ;
- 200 / semaine ;
- 500 / mois.

Ils sont désormais rattachés à l'établissement actif pour les flux manuels au lieu de l'utilisateur authentifié qui pilote éventuellement plusieurs comptes.

Variables optionnelles :

- `AI_QUOTA_CREDITS_DAY`
- `AI_QUOTA_CREDITS_WEEK`
- `AI_QUOTA_CREDITS_MONTH`

Les flux Stats iNrAgent et transcription sont désormais couverts par les crédits. Les admins restent exemptés selon l'acteur authentifié.

## 7. Erreurs économiques

Les erreurs :

- `ai_gateway_account_limit_reached`
- `ai_operation_budget_exceeded`

sont rendues en HTTP 429 par `jsonUserFacingError`, même si une route appelante avait prévu un fallback 502.

## 8. Supabase / Vercel

- Aucun SQL supplémentaire Étape 5.
- Aucune variable Vercel obligatoire supplémentaire : les limites ont des valeurs sûres par défaut.
- Les variables optionnelles ci-dessus servent uniquement à modifier volontairement les plafonds.
- `KV_REST_API_URL` et `KV_REST_API_TOKEN` restent nécessaires pour activer les compteurs Upstash en production, comme pour le système de quota existant.

## QA

- `npm run audit:ai-gateway`
- `npm run test:ai-gateway`
- `npm run typecheck`
- `npm run qa:ai-gateway`
