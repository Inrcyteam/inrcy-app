# iNrCy Ops Runbook (1 page)

This runbook is the **minimum** you need to operate iNrCy safely at scale.

## Key links

- Vercel → Deployments / Logs
- Supabase → Database / Logs / Query Performance
- Sentry → Issues / Performance

## Health checks

- Public (safe): `GET /api/health`
- Internal (deep): `GET /api/health/internal` with header `x-health-token: $HEALTHCHECK_TOKEN`

If internal health is `503`, check:
- Supabase status + connection pool
- Upstash/KV status

## Incident triage (5 minutes)

1. **Is it global or one tenant?**
   - Check Vercel error rate + Sentry issue volume.
2. **Capture a request id**
   - Every API response should include / log an `x-request-id`.
3. **Identify the failing surface**
   - Auth? DB? KV? OAuth provider? OpenAI?

## Common incidents

### A) Spike of 500/503

1. Vercel Logs: filter status 5xx.
2. Sentry: open latest issue, check stacktrace.
3. Supabase: check Database health + Query Performance.
4. If a recent deploy caused it: **rollback** to previous Vercel deployment.

### B) OAuth callbacks failing

1. Verify provider settings: redirect URL matches current domain.
2. Check server logs for `state` mismatch (cookie/domain).
3. Confirm ENV vars: client id/secret present in Production.

### C) Rate limit / quota complaints

1. Confirm the endpoint class and limits in Vercel ENV.
2. Check Upstash usage/latency.
3. Temporarily raise limits for a specific tenant only (future improvement) or raise global safely.

### D) DB latency / timeouts

1. Supabase Query Performance: identify slow query.
2. Add indexes / reduce payload / paginate.
3. If urgent: hotfix to reduce expensive queries + deploy.

## Rollback process

1. Vercel → Deployments → select last known-good → **Redeploy**.
2. If DB migration was deployed, apply **forward-fix migration** (preferred) or restore from backup/PITR.

## Post-incident

- Write a 10-lines postmortem: timeline, root cause, fix, prevention.
- Add an alert or test so it’s caught earlier next time.
