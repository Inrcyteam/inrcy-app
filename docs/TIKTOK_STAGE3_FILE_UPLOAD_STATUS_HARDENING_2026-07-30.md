# TikTok - Etape 3 - upload fichier et suivi reel

Date : 2026-07-30

## Correctifs

- Les videos TikTok utilisent uniquement `FILE_UPLOAD`.
- Le repli silencieux vers `PULL_FROM_URL` est supprime pour les videos.
- Si le fichier n'est plus disponible dans le stockage iNrCy, l'envoi est bloque avec un message clair.
- Les photos TikTok conservent leur transfert `PULL_FROM_URL`, qui reste le flux prevu pour ce media.
- Une erreur de lecture du statut n'est plus transformee en faux statut `en traitement`.
- Le vrai statut TikTok, le `fail_reason`, les octets recus et les identifiants de posts publics sont conserves dans iNrSend.
- iNrSend verifie automatiquement les publications TikTok en attente toutes les 20 secondes, puis toutes les 60 secondes apres 5 minutes.
- Un traitement sans progression recente est signale comme prolonge sans etre declare faussement echoue.
- La relance manuelle reste protegee par l'avertissement contre les doublons.

## Fichiers principaux

- `lib/tiktokPublish.ts`
- `app/api/booster/publish-now/route.ts`
- `app/api/inrsend/publications/[publicationId]/tiktok/status/route.ts`
- `app/api/inrsend/publications/[publicationId]/tiktok/retry/route.ts`
- `app/dashboard/mails/_components/MailboxDetailsModal.tsx`
- `tests/tiktok/tiktok-stage3-hardening.test.mjs`

## Validation

- TypeScript : OK
- ESLint cible : OK
- Tests TikTok Etape 3 : 6/6
- Tests iNrSend : 31/31
- Aucun SQL ni nouvelle variable d'environnement.
