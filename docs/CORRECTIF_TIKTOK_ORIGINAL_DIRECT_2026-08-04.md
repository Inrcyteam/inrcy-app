# Correctif TikTok urgent - original direct

## Cause ciblée

Les photos TikTok utilisent `PULL_FROM_URL`. Le point d'accès public `/api/media/tiktok` passait encore par le proxy global de l'application (rafraîchissement de session Supabase, contrôles de compte, rate limiting et réécriture des en-têtes). Une réponse intermédiaire 401/403/429 ou un traitement inutile peut laisser TikTok bloqué en `PROCESSING_DOWNLOAD`.

Le correctif précédent choisissait aussi une variante `social-feed`, contrairement à la politique demandée : TikTok doit recevoir le média original.

## Modifications

- TikTok photo choisit `originalStoragePath` en priorité.
- URL TikTok construite avec `variant=raw` : octets originaux, sans Sharp, recadrage, fond, canvas, compression ou réencodage.
- `/api/media/tiktok` contourne le proxy global ; la route reste protégée par signature HMAC et expiration.
- Les diagnostics enregistrent les chemins de stockage utilisés et la politique `original_exact_bytes`.
- Le bouton Retenter reconstruit une nouvelle URL signée `raw` depuis les chemins originaux.
- Correctifs vidéo du ZIP précédent conservés.

## Contrôles exécutés

- 19 tests TikTok réussis.
- 5 tests spécifiques du correctif réussis.
- Contrôle syntaxique Node des trois fichiers TypeScript modifiés réussi.
- Test de certification publish-now : 7/7 réussis.

Le test réel final nécessite un déploiement Vercel et un appel de TikTok, impossible à simuler localement sans les identifiants et l'infrastructure de production.
