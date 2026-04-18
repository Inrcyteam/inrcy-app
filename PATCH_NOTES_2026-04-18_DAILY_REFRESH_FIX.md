# Daily refresh fix

## What changed

- Removed the Vercel cron warmers for `/api/cron/daily-metrics-summary`.
- Added a per-user daily refresh lock in Supabase.
- Added `/api/stats/daily-refresh` to run the first refresh of the day on demand.
- Dashboard now waits for the daily bootstrap before hydrating cached KPI values.
- iNrStats now waits for the daily bootstrap before hydrating cached stats.
- Added a small client helper to call the new bootstrap endpoint.

## Supabase

Run:

- `ops/sql/2026-04-18_daily_stats_refresh.sql`

before deploying the app.

## Update v2 — suppression finale du cron + correction build

- Deleted `app/api/cron/daily-metrics-summary/route.ts`.
- Added `scripts/prebuild-clean.mjs`.
- Added `prebuild` script in `package.json` to remove stale `.next` and `tsconfig.tsbuildinfo` before every build.
- Removed committed `tsconfig.tsbuildinfo` to avoid stale route references.

Why this fixes the build error:
- Next.js had stale generated route validator artifacts referencing `/api/cron/daily-metrics-summary`.
- Cleaning `.next` before `next build` forces validator regeneration from the current routes only.

## Update v3 — mémoire UI pour éviter le refresh à chaque retour

- Added account-scoped UI freshness markers for the daily bootstrap check.
- Added account-scoped UI freshness markers for dashboard/iNrStats server cache sync checks.
- Reused cached generator and iNrStats snapshots immediately when they already match the current snapshot date and last channel sync.
- Added a 10-minute client-side throttle so closing/reopening the page does not re-trigger a visible refresh every time.
