# iNrCy — AI Gateway — Étape 1 : audit de l’IA actuelle

Date de l’audit : 10 juillet 2026  
Base analysée : `inrcy-app-booster-layout-inrstats-identities-fix(1).zip`

## 1. Conclusion exécutive

L’architecture actuelle est **favorable à une migration vers un AI Gateway** : la génération texte/vision JSON est principalement centralisée dans `lib/openaiClient.ts`.

Cependant, la migration ne doit pas se limiter à remplacer une URL. Plusieurs dépendances OpenAI spécifiques existent encore :

- un appel direct à l’API de transcription OpenAI ;
- des garde-fous qui testent explicitement `OPENAI_API_KEY` ;
- des variables d’environnement, diagnostics admin, erreurs et documentation spécifiques à OpenAI ;
- aucune préférence de moteur/modèle dans la Configuration IA ;
- des quotas iNrCy qui mesurent une **action utilisateur** et non le nombre réel de requêtes fournisseur.

La recommandation pour l’étape 2 est de créer une **couche fournisseur unique iNrCy**, puis de faire passer la génération JSON actuelle par cette couche sans modifier les prompts métier.

## 2. Topologie actuelle

### 2.1 Client central

`lib/openaiClient.ts`

Rôle actuel :

- serveur uniquement ;
- appel `POST` vers l’API OpenAI Responses ;
- authentification via `OPENAI_API_KEY` ;
- choix de modèle via `OPENAI_MODEL` et `OPENAI_VISION_MODEL` ;
- entrée texte + images en data URL ;
- sortie JSON forcée via `text.format = { type: "json_object" }` ;
- parsing et extraction de JSON ;
- retries et timeout via `fetchWithRetry`.

C’est le **point de migration principal**.

### 2.2 Consommateurs directs de `openaiGenerateJSON`

Huit fichiers consommateurs ont été identifiés :

1. `lib/boosterPublishGeneration.ts`
2. `lib/aiAttachmentContext.ts`
3. `lib/templateAiGeneration.ts`
4. `app/api/mails/generate-ai/route.ts`
5. `app/api/e-reputation/google/generate-reply/route.ts`
6. `app/api/e-reputation/trustpilot/generate-reply/route.ts`
7. `app/api/agent/actions/send-stats-report/route.ts`
8. `app/api/booster/transcribe/route.ts` pour le nettoyage de transcription

### 2.3 Appel fournisseur direct hors client central

`app/api/booster/transcribe/route.ts`

Cet endpoint appelle directement :

- `https://api.openai.com/v1/audio/transcriptions`
- `OPENAI_TRANSCRIBE_MODEL`
- fallback modèle `whisper-1`

Il doit être traité séparément. Il ne faut pas considérer la migration terminée tant que ce point n’est pas explicitement décidé :

- soit transcription maintenue chez OpenAI ;
- soit transcription abstraite dans la couche fournisseur ;
- soit service dédié distinct de la génération de contenu.

## 3. Cartographie fonctionnelle complète

### Booster / Publier

Entrée API : `POST /api/booster/generate`

Chaîne :

`PublishModal` → `/api/booster/generate` → `generateSharedBoosterPosts` → `openaiGenerateJSON`

Canaux couverts :

- Site iNrCy
- Site web
- Google Business
- Facebook
- Instagram
- LinkedIn
- TikTok
- YouTube
- Pinterest

Particularités :

- lots de 3 canaux sociaux ;
- sites regroupés séparément ;
- YouTube isolé ;
- retries ;
- reprise canal unique ;
- récupération qualité ;
- sauvetage dédié YouTube ;
- vision possible.

### iNrAgent — Publier

Entrée : `app/api/agent/actions/prepare-publish/route.ts`

Réutilise directement : `generateSharedBoosterPosts`

Conclusion : une migration correcte du moteur Booster couvre aussi la génération de publication iNrAgent.

### Propulser

Entrée API commune : `POST /api/templates/generate-ai`

Écrans identifiés :

- Valoriser
- Récolter
- Offrir

Chaîne :

modale → `/api/templates/generate-ai` → `generateTemplateAiContent` → `openaiGenerateJSON`

### Fidéliser

Entrée API commune : `POST /api/templates/generate-ai`

Écrans identifiés :

- Informer
- Enquêter
- Suivre

Même chaîne que Propulser.

### iNrAgent — Campagnes

Entrée : `app/api/agent/actions/prepare-campaign/route.ts`

Réutilise directement : `generateTemplateAiContent`

Conclusion : une migration correcte du moteur templates couvre aussi les campagnes iNrAgent.

### Mails

Entrée API : `POST /api/mails/generate-ai`

Chaîne :

`MailboxComposeModal` → route mail → `openaiGenerateJSON`

### Pièces jointes IA

`lib/aiAttachmentContext.ts`

Utilise la vision pour :

- résumer une image ;
- analyser jusqu’à 3 frames extraites d’une vidéo ;
- fournir le contexte au générateur de mails/templates.

Ce flux impose de vérifier la compatibilité image du modèle choisi par le pro.

### Réputation

Deux générateurs :

- Google Reviews
- Trustpilot

Les deux utilisent la Configuration IA et `openaiGenerateJSON`.

### iNrAgent — Rapport de statistiques

`app/api/agent/actions/send-stats-report/route.ts`

Utilise `openaiGenerateJSON` pour les insights statistiques.

Point bloquant actuel : la fonction vérifie explicitement `process.env.OPENAI_API_KEY` avant génération. Sans clé OpenAI, elle bascule en fallback local même si un Gateway est configuré.

### Dictée / transcription

`app/api/booster/transcribe/route.ts`

Deux sous-flux :

1. transcription audio/vidéo via appel direct OpenAI ;
2. correction du texte transcrit via `openaiGenerateJSON`.

## 4. Configuration IA actuelle

Fichier principal :

`app/dashboard/settings/_components/AiConfigurationContent.tsx`

Préférences actuellement enregistrées dans `business_profiles` :

- ton ;
- style du texte ;
- originalité ;
- longueur ;
- emojis ;
- langue ;
- pronom ;
- tutoiement/vouvoiement ;
- niveau commercial ;
- objectif principal ;
- angle préféré ;
- CTA préféré ;
- exemple de contenu aimé ;
- éléments à éviter.

**Aucun champ moteur IA ou modèle IA n’existe actuellement.**

Point d’intégration recommandé pour la suite : ajouter le choix moteur/modèle dans cette Configuration IA, avec persistance par `business_profile` / compte actif.

## 5. Quotas et limitations actuels

Fichier : `lib/aiUsageQuota.ts`

Limites réelles trouvées dans le code :

- 60 crédits / jour
- 200 crédits / semaine
- 500 crédits / mois

Les admins sont exemptés.

Actions suivies :

- `booster`
- `template`
- `mail`
- `review_reply`

Coûts en crédits iNrCy :

- Booster texte : 4
- Booster avec images : 6
- Booster avec vidéo : 8
- Mail : 1 à 5 selon pièces jointes
- Template : 2 à 6 selon pièces jointes
- Réponse avis : 1 ou 2

### Écart important entre crédits et coût fournisseur

Le quota est débité au niveau de l’action utilisateur, avant la génération. Or une action Booster peut déclencher plusieurs appels fournisseur :

- génération par lots ;
- retry HTTP ;
- reprise lot en canal unique ;
- seconde génération des canaux invalides ;
- récupération ciblée canal par canal ;
- sauvetage YouTube ;
- appels vision.

Conclusion : **1 action / 4 à 8 crédits iNrCy n’équivaut pas à 1 requête modèle**.

C’est le principal sujet à instrumenter pour le pilotage des coûts multi-modèles.

### Flux non couverts par `consumeAiCredits`

À auditer/traiter dans les étapes suivantes :

- transcription ;
- rapport stats iNrAgent.

Leur protection repose sur d’autres rate limits, pas sur le compteur de crédits IA commun.

## 6. Rate limits identifiés

- Booster : 10 / minute
- Mails IA : 60 / jour
- Réponse avis Google : 80 / jour
- Réponse avis Trustpilot : 80 / jour
- iNrAgent prepare-publish : 4 / minute
- iNrAgent prepare-campaign : 4 / minute
- iNrAgent rapport stats : 2 / minute
- Transcription : 12 / 10 minutes

Les templates appliquent également leur propre rate limit dans `lib/templateAiGeneration.ts`.

## 7. Dépendances et environnement

Le projet n’a actuellement aucune dépendance :

- `ai`
- `@ai-sdk/*`

Variables OpenAI identifiées :

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_VISION_MODEL`
- `OPENAI_TRANSCRIBE_MODEL`
- `OPENAI_TRANSCRIPT_CLEANUP_MODEL`

Autres points couplés :

- `scripts/verify-env.mjs`
- `docs/ENVIRONMENT_CHECKLIST.md`
- `app/api/admin/settings/route.ts`
- `lib/userFacingErrors.ts`
- `app/api/agent/actions/send-stats-report/route.ts`
- textes de politique de confidentialité / mentions de sous-traitants
- runbook et observabilité

## 8. Risques de migration

### Risque A — JSON multi-modèles

Le code attend un objet JSON strict. Tous les modèles ne réagissent pas de manière identique aux mêmes paramètres et formats de sortie.

Mesure recommandée : conserver une abstraction unique avec validation/normalisation et erreurs homogènes.

### Risque B — vision

Un pro pourrait sélectionner un modèle texte non compatible image alors que :

- Booster reçoit des images ;
- les pièces jointes mails utilisent la vision ;
- la vidéo est transformée en frames.

Mesure recommandée : matrice de capacités par modèle et fallback explicite.

### Risque C — paramètres non universels

`temperature`, budget de tokens, Responses API et formats JSON peuvent varier selon les modèles.

Mesure recommandée : normaliser les options dans une couche iNrCy et adapter par moteur.

### Risque D — coûts réels

Le mécanisme Booster peut multiplier les appels. Un modèle premium choisi par un pro peut donc faire exploser le coût d’une action sans changement visible du quota iNrCy.

Mesure recommandée : journaliser au minimum modèle, fournisseur, route, nombre d’appels, statut, durée et usage token/coût quand disponible.

### Risque E — fallback silencieux

Le rapport stats iNrAgent teste encore `OPENAI_API_KEY`. D’autres erreurs et diagnostics sont également OpenAI-spécifiques.

Mesure recommandée : aucun test de disponibilité ne doit dépendre du nom d’un fournisseur.

### Risque F — juridique / confidentialité

La politique actuelle mentionne explicitement OpenAI. L’ajout de fournisseurs supplémentaires implique une revue des mentions de sous-traitants et traitements.

## 9. Architecture cible recommandée pour l’étape 2

Sans toucher aux prompts métier :

`Modules iNrCy`  
→ `lib/aiProviderClient.ts` ou équivalent  
→ résolution du modèle  
→ Vercel AI Gateway  
→ fournisseur/modèle choisi

Compatibilité transitoire recommandée :

- garder `openaiGenerateJSON` comme wrapper temporaire si nécessaire ;
- introduire un nouveau nom neutre, par exemple `generateAiJson` ;
- migrer progressivement les imports ;
- préserver le format des retours pour éviter toute régression Booster/Agent/Mails.

## 10. Ordre de migration conseillé

1. Créer l’abstraction fournisseur neutre.
2. Brancher le modèle OpenAI actuel via Gateway, sans choix utilisateur.
3. Vérifier à résultat fonctionnel équivalent.
4. Migrer tous les appels JSON/vision.
5. Décider séparément du sort de la transcription.
6. Ajouter la sélection moteur/modèle en Configuration IA.
7. Ajouter métriques/coûts/fallbacks.
8. Mettre à jour diagnostics, env, erreurs et juridique.

## 11. Outil d’audit ajouté

Commande :

```bash
npm run audit:ai-gateway
```

Elle recense :

- usages de `openaiGenerateJSON` ;
- appels directs `api.openai.com` ;
- variables `OPENAI_*` ;
- références `AI_GATEWAY_*` ;
- références à l’endpoint Vercel AI Gateway.

Le script est informatif et ne modifie aucun fichier.

## 12. Verdict étape 1

**GO pour l’étape 2.**

La base est saine pour une migration progressive. Le meilleur choix est de ne pas réécrire Booster, Propulser, Fidéliser, Mails ou iNrAgent : il faut remplacer leur dépendance fournisseur par une couche centrale neutre, puis brancher le Gateway derrière.
