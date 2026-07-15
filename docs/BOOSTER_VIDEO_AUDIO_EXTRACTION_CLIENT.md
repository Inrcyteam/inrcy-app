# Booster / Publier — transcription vidéo par audio seul

## Objectif

Éviter les réponses HTTP 413 quand une vidéo est envoyée à la Function de transcription, sans retirer l'analyse audio ni les trois captures visuelles.

## Flux final

1. Dès la sélection d'une vidéo, le navigateur prépare en parallèle :
   - les trois captures visuelles existantes ;
   - une piste WAV mono 16 kHz destinée uniquement à la transcription.
2. La transcription IA ne démarre toujours qu'au clic sur Générer : aucun crédit n'est consommé à la simple sélection.
3. Si le WAV reste sous le seuil sûr de la Function, il est envoyé directement.
4. S'il dépasse ce seuil, il est envoyé directement du navigateur vers le bucket Supabase `booster` avec une URL signée temporaire ; la Function ne reçoit ensuite qu'un petit JSON contenant le chemin.
5. La Function télécharge l'audio, le transcrit puis supprime le fichier temporaire dans un `finally`.
6. Si l'extraction locale n'est pas supportée :
   - une très petite vidéo conserve l'ancien fallback ;
   - une vidéo plus lourde continue avec le sujet et les trois captures, sans erreur visible.

## Qualité

- WAV PCM 16 bits ;
- mono ;
- 16 kHz, comme la préparation FFmpeg historique ;
- transcription corrigée et quotas vidéo inchangés ;
- aucun changement du prompt ou de la génération des dix canaux.

## Portée iNrAgent / iNrSend

- iNrAgent partage le moteur rédactionnel multicanal, les contrôles qualité et la résilience AI Gateway, mais son automatisation sélectionne des médias déjà stockés côté serveur. Le préchauffage navigateur et cette extraction audio ne s'appliquent donc pas automatiquement à iNrAgent.
- iNrSend conserve les brouillons et historiques. Un brouillon rouvert dans Booster bénéficie du nouveau flux, mais la messagerie et l'historique iNrSend n'utilisent pas cette transcription vidéo.
