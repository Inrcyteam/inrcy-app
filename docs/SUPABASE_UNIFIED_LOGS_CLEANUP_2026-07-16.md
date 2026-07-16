# Nettoyage Unified Logs Supabase - 16 juillet 2026

## Erreurs traitees

- `23505 / 409 inrbadge_events_pkey`
  - Cause : deux appels simultanes pouvaient tenter d'inserer le meme identifiant deterministe.
  - Correctif : insertion idempotente avec `upsert(..., { onConflict: "id", ignoreDuplicates: true })`.

- `42501 Direct deletion from storage tables is not allowed`
  - Cause : ancien job `pg_cron` supprimant directement dans `storage.objects` pour `inrbox_attachments`.
  - Correctif : desactivation du job obsolete par le script SQL du lot.
  - La retention iNrSend actuelle reste geree par `/api/cron/inrsend-retention`.

- `42P01 relation public.stats_snapshots does not exist`
  - Cause : ancien job `pg_cron` reference une table qui n'est plus utilisee par le code actuel.
  - Correctif : desactivation du job obsolete par le script SQL du lot.

## Evenements ne demandant pas de modification

- `502` isole sur la signature d'un media Storage : incident ponctuel cote service. Le code accepte deja l'absence d'URL signee sans faire tomber la page. A surveiller uniquement si l'erreur se repete.
- Anciens `403 /auth/v1/user` : le garde-fou de session est deja present dans `lib/supabaseClient.ts` et `lib/supabaseServer.ts`. Les lignes historiques restent visibles pendant la plage de temps selectionnee.

## A executer dans Supabase

Executer une seule fois :

`ops/sql/2026-07-16_supabase_logs_stale_crons_cleanup.sql`
