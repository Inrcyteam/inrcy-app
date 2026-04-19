# Outlook auth patch

## Objectif
Éviter qu'un scanner de liens consomme le token Supabase avant le vrai clic utilisateur.

## Changement principal
- `/auth/callback` ne consomme plus immédiatement `token_hash` pour les liens `invite` et `recovery`.
- Il redirige désormais vers :
  - `/auth/finish-invite`
  - `/auth/finish-reset`
- La vérification `verifyOtp()` se fait uniquement après action utilisateur sur un bouton `Continuer`.

## Fichiers modifiés
- `app/auth/callback/route.ts`
- `app/auth/_components/FinishEmailLinkClient.tsx`
- `app/auth/finish-invite/page.tsx`
- `app/auth/finish-reset/page.tsx`
- `app/api/public/trial-signup/route.ts`
- `app/api/admin/create-trial/route.ts`
- `app/login/page.tsx`

## Supabase
Les emails doivent pointer vers les nouvelles pages `finish-*`.
