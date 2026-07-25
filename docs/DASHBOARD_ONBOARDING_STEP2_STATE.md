# Dashboard onboarding - Step 2 state

This step adds persistence only. It does not open panels, add progress UI, or lock modules yet.

## Database

Run before deploying the code:

```text
ops/sql/2026-07-25_dashboard_onboarding_state.sql
```

Optional read-only verification:

```text
ops/checks/2026-07-25_dashboard_onboarding_state_check.sql
```

The migration creates one `inrcy_onboarding_states` row per `inrcy_accounts.id`.

- Accounts already present when the migration runs are inserted as `completed` so existing professionals are not interrupted.
- Accounts created later are inserted as `pending`, step `profile`.
- The first dashboard load changes `pending` to `in_progress` through a guarded RPC.
- Reads and updates are scoped by `inrcy_can_access_account`, so a multi-account user cannot mix onboarding state between establishments.

## Client state

`useDashboardOnboardingState` exposes:

- current account, status, step, and version;
- first-opening detection;
- refresh, step change, defer, resume, and completion actions;
- safe fallback when the migration is not yet available.

The dashboard currently exposes status and step as data attributes for tests only. Visual behavior is intentionally reserved for step 3.
