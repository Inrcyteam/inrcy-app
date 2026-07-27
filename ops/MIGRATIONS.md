# Database migrations & safety

## Principles

1. **Backward compatible first**
   - Add columns/tables/indexes without breaking running code.
2. **Deploy code second**
   - Code can start using the new fields.
3. **Clean-up last**
   - Drop old columns only after you’re sure no deployment needs them.

## Safe migration patterns

### Add a column

1. Add column nullable
2. Deploy code that writes it
3. Backfill data
4. Add NOT NULL constraint (optional)

### Change types

Prefer: add a new column, backfill, swap reads, then drop old.

### Indexes

- Add indexes for `user_id` + frequent filters (`created_at`, `status`).
- Validate query plans in Supabase Query Performance.

## Rollback guidance

Prefer **forward-fix** migrations rather than "down" in production.

If you must restore:
- Use Supabase backup/PITR
- Redeploy last-known-good Vercel build

## 2026-07-15 — iNrAgent Lot C, contexte vidéo persistant

Exécuter avant ou juste après le déploiement :

```text
ops/sql/2026-07-15_inragent_video_ai_context_cache.sql
```

La migration ajoute uniquement des colonnes et un index à `pro_media_library`. Elle est idempotente et le code garde un fallback non bloquant tant qu'elle n'est pas appliquée.

## 2026-07-25 - Dashboard onboarding state

Run before deploying onboarding step 2:

```text
ops/sql/2026-07-25_dashboard_onboarding_state.sql
```

This migration creates an account-scoped onboarding state. Existing accounts are backfilled as completed; future accounts start at profile / pending.

## 2026-07-27 - iNr'Send safe campaigns

Run in this order before deploying Step 2:

```text
ops/sql/2026-07-27_inrsend_step1_safe_dispatch.sql
ops/sql/2026-07-27_inrsend_step2_intelligent_campaigns.sql
```

Step 1 creates the distributed mailbox lock. Step 2 adds campaign pause metadata, failure diagnostics, the per-campaign deduplication key and the atomic recipient claim function.


## 2026-07-27 - iNr'Send reputation protection

Run after the Step 1 and Step 2 migrations, before deploying Step 3:

```text
ops/sql/2026-07-27_inrsend_step3_reputation_protection.sql
```

Step 3 adds the server-managed mailbox reputation state, DNS authentication audit cache and protected delivery-feedback storage.
