# AI Gateway — Étape 6 bis : transcription 100 % Gateway et nettoyage

## Objectif

Supprimer le dernier appel fournisseur IA direct et faire passer également la transcription brute par Vercel AI Gateway.

## Architecture finale

```text
iNrCy
  -> Vercel AI Gateway
       -> génération texte / vision selon le moteur préféré du compte
       -> transcription Speech-to-Text via modèle OpenAI de transcription
```

Aucune route runtime iNrCy n'appelle directement un endpoint fournisseur IA.

## Transcription

Endpoint Gateway utilisé par défaut :

```text
https://ai-gateway.vercel.sh/v4/ai/transcription-model
```

Modèles :

```text
principal : openai/gpt-4o-transcribe
fallback  : openai/whisper-1
```

Variables optionnelles :

```text
AI_GATEWAY_TRANSCRIBE_MODEL
AI_GATEWAY_TRANSCRIBE_FALLBACK_MODEL
AI_GATEWAY_TRANSCRIPTION_URL
AI_GATEWAY_ALLOWED_TRANSCRIPTION_MODELS
```

Aucune de ces variables n'est obligatoire : des valeurs par défaut sûres sont intégrées.

## Vidéos

Le REST Speech-to-Text Gateway attend un payload audio base64. Pour une vidéo Booster, iNrCy tente d'abord d'extraire une piste MP3 mono 16 kHz avec FFmpeg. Si FFmpeg est indisponible, un dernier essai best-effort avec le conteneur original est conservé ; l'échec reste non bloquant car la transcription vidéo n'est qu'un enrichissement de contexte.

## Nettoyage obsolète

Supprimé du runtime actif :

- `OPENAI_API_KEY`
- `OPENAI_TRANSCRIBE_MODEL`
- appel direct `https://api.openai.com/v1/audio/transcriptions`
- fallback fournisseur direct dans la transcription
- statut admin spécifique à la clé OpenAI
- exception d'audit autorisant un endpoint OpenAI direct

## Garde-fous

Chaque tentative HTTP de transcription Gateway est comptée par établissement actif via le garde-fou économique existant. Les appels de transcription sont identifiés par :

```text
booster.transcribe
```

Le nettoyage du texte transcrit reste identifié séparément :

```text
booster.transcript-cleanup
```

## Vercel / Supabase

- Supabase : aucune migration.
- Vercel : aucune nouvelle variable obligatoire.
- Après validation en production, `OPENAI_API_KEY` et `OPENAI_TRANSCRIBE_MODEL` peuvent être supprimées de Vercel si aucun ancien déploiement n'en dépend encore.
