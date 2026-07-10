# AI Gateway — Étape 6 : QA finale multi-IA

## Objectif

Valider et durcir la chaîne iNrCy après l'intégration des 8 moteurs : contrats JSON, préservation des paragraphes, cohérence vision, catalogue Vercel, capacités de sortie et non-régression des volumes de texte.

## Durcissements runtime

### Parseur JSON multi-fournisseurs

`lib/aiGatewayResponse.ts` accepte désormais :

- objet JSON propre ;
- JSON dans un bloc Markdown ;
- JSON entouré d'un court texte parasite ;
- objet JSON double-encodé.

Il refuse tableaux et primitives. Les chaînes de texte ne sont jamais compactées : les `\n\n` restent intacts.

### Contrat automatique pour les moteurs prompt-only

Perplexity, DeepSeek et Llama reçoivent automatiquement un contrat technique commun :

- objet JSON uniquement ;
- aucun Markdown ;
- aucune phrase avant/après ;
- conservation des paragraphes et doubles sauts de ligne.

Ce contrat complète les prompts métier sans changer les règles éditoriales iNrCy.

## QA catalogue officiel

Commande :

```bash
npm run verify:ai-gateway-catalog
```

Elle interroge `https://ai-gateway.vercel.sh/v1/models` et vérifie :

- présence des 8 identifiants `provider/model` ;
- type `language` ;
- au moins 8 000 tokens de sortie disponibles ;
- cohérence des capacités vision avec le routage iNrCy.

## Smoke test live optionnel

Commande :

```bash
npm run qa:ai-gateway:live
```

Prérequis : `AI_GATEWAY_API_KEY` ou `VERCEL_OIDC_TOKEN` disponible dans l'environnement d'exécution.

Le script envoie une très petite requête JSON à chacun des 8 modèles et échoue si un moteur ne respecte pas le contrat. Pour ajouter les tests image des moteurs vision :

```bash
AI_GATEWAY_LIVE_QA_VISION=1 npm run qa:ai-gateway:live
```

Ce test est volontairement hors QA par défaut car il consomme de vrais appels Gateway.

## QA finale

```bash
npm run qa:ai-gateway:final
```

Enchaîne : audit architecture, tests multi-IA, typecheck et validation live du catalogue public Vercel.

## Non-régression des volumes

Aucun plafond éditorial n'a été réduit à l'étape 6 :

- Booster : 8 000 tokens max par sous-appel ;
- iNrAgent Publier : 8 000 ;
- sauvetage YouTube : 8 000 ;
- limites de texte normalisées inchangées (site jusqu'à 6 000 caractères, réseaux jusqu'à 2 000 dans la normalisation actuelle).


## Suite 6 bis

La transcription brute a ensuite été migrée vers Vercel AI Gateway et les variables OpenAI directes ont été retirées du runtime actif. Voir `AI_GATEWAY_STEP6BIS_TRANSCRIPTION_CLEANUP.md`.
