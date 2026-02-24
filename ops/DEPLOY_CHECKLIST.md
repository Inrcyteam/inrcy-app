# Deploy checklist (Go/No-Go)

## Before deploy

- [ ] Sentry is receiving events (test in Preview only)
- [ ] `HEALTHCHECK_TOKEN` set in Vercel (Production)
- [ ] Supabase backups enabled (and PITR if available)
- [ ] New ENV vars added to **Production + Preview**
- [ ] Migrations applied in staging/preview first
- [ ] Smoke tests pass (login, dashboard load, one publish dry-run)

## Deploy

- [ ] Deploy to **Preview** and validate critical flows
- [ ] Promote / deploy to **Production**

## After deploy (10 minutes)

- [ ] Check `GET /api/health` = 200
- [ ] Check `GET /api/health/internal` = 200
- [ ] Vercel Logs: no spike 5xx
- [ ] Sentry: no new high-volume issue
- [ ] Key user journeys OK:
  - [ ] Auth
  - [ ] Integrations list
  - [ ] Create a publication (no send required)

## Rollback decision

Rollback if:
- 5xx error rate spikes and persists > 3 minutes
- OAuth callbacks fail for multiple users
- DB is saturated / timeouts start appearing
