# iNrCy Multi-IA V2 — Étape 6 : QA live et calibration bornée

## Objectif

Valider les huit moteurs sur des usages iNrCy réalistes et mesurer, sans ajouter un juge IA payant :

- succès / échec ;
- complétude des canaux ;
- adaptation aux règles de canal ;
- respect de la langue ;
- respect des préférences du pro ;
- ancrage à la phrase libre ;
- diversité entre canaux ;
- diversité entre moteurs ;
- taux de réparation ciblée ;
- latence ;
- tokens entrée / sortie ;
- coût lorsque `AI_GATEWAY_MODEL_PRICING_JSON` est configuré.

## Modes

### Smoke — 8 appels légers

```bash
npm run qa:ai-gateway:live
```

### Matrix — scénarios couvrant 1 canal, 5 canaux, tous les canaux, texte, image, contexte vidéo, FR/ES/EN, profil minimal/complet, créativité classique/équilibrée/créative

La matrice consomme des tokens et exige une confirmation explicite :

```bash
AI_GATEWAY_LIVE_QA_CONFIRM=RUN_MATRIX npm run qa:ai-gateway:matrix
```

### Full — matrice élargie

```bash
AI_GATEWAY_LIVE_QA_CONFIRM=RUN_FULL_MATRIX npm run qa:ai-gateway:full
```

## Rapports

Les modes `matrix` et `full` écrivent :

- un rapport live JSON ;
- une recommandation de calibration JSON.

Le script ne modifie jamais automatiquement la production. La recommandation est bornée et s'applique uniquement après revue via :

```text
AI_ENGINE_CALIBRATION_JSON={...}
```

Les paramètres ajustables sont volontairement limités :

- `temperatureOffset` : -0.20 à +0.20 ;
- `outputTokenMultiplier` : 0.75 à 1.35 ;
- `timeoutMultiplier` : 0.75 à 1.35.

La personnalité native de chaque moteur reste définie dans `lib/aiWritingProfile.ts` et n'est jamais remplacée par la calibration.

## Recalcul depuis un rapport existant

```bash
node scripts/calibrate-ai-engines.mjs artifacts/mon-rapport.json
```

## Sécurité économique

- `smoke` reste léger ;
- `matrix` et `full` exigent une confirmation explicite ;
- un délai inter-appels est configurable via `AI_GATEWAY_LIVE_QA_DELAY_MS` ;
- aucun tarif volatil n'est codé en dur ;
- le coût n'est calculé que si `AI_GATEWAY_MODEL_PRICING_JSON` est fourni ;
- un moteur sans vision utilise une préanalyse visuelle neutre, puis reste lui-même l'auteur final.
