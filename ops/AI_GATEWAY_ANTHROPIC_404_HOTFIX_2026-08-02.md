# AI Gateway Anthropic 404 hotfix — 2026-08-02

- Remplacement de `anthropic/claude-3.5-haiku` par `anthropic/claude-haiku-4.5`.
- Un HTTP 404 ne relance plus le même modèle : bascule immédiate vers le secours Gateway.
- Normalisation défensive de `AI_GATEWAY_BASE_URL` si une URL d'endpoint complète a été enregistrée.
- Ajout du détail fournisseur tronqué dans les logs privés Vercel.
- Aucun changement du pipeline média, des programmations, des scopes Meta ou de la base Supabase.
