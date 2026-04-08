# Google Protection multicompte — V2 safe

Cette V2 ajoute cinq finitions sans refonte des flows existants :

1. Révocation Google best-effort lors des déconnexions manuelles Gmail / Google Stats / Google Business account.
2. Déduplication des événements RISC par `jti`.
3. Signal UI léger de `reauth_required` pour GA4 / GSC / Google Business.
4. Mapping amélioré des événements `tokens-revoked` via `token_identifier_alg` + `token`.
5. Endpoints internes de santé et test pour le receiver RISC.

## Nouvelles routes

- `GET /api/security/google/risc/status`
- `GET /api/health/internal/google-risc`
- `POST /api/security/google/risc/test`

Les deux routes internes nécessitent l'en-tête `x-health-token: <HEALTHCHECK_TOKEN>`.

## SQL recommandé

Appliquer `ops/sql/google_risc_v2.sql` pour ajouter un index unique sur `jti` si la table existe déjà.
