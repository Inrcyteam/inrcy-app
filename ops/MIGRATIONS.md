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
