# Dashboard onboarding - Step 3 guided drawers

This step reuses the existing dashboard drawers. No duplicate profile, activity, or AI form is introduced.

## First opening

For an establishment whose onboarding state is `in_progress`:

1. the existing `Mon profil` drawer opens automatically;
2. a successful save advances only when the central completion check confirms that Profile is complete, then opens the existing `Mon activité` drawer;
3. a successful save advances only when the central completion check confirms that Activity is complete, then opens the existing `Configuration IA` drawer;
4. saving or simply closing the AI drawer completes onboarding because the default AI configuration is already valid.

The drawer header displays `Configuration initiale · Étape 1/3`, `2/3`, or `3/3` only while this guided flow is active. Normal later openings remain unchanged.

## Closing early

Closing Profile or Activity before completing the guided flow marks the onboarding state as `deferred` and returns to the dashboard. It is not reopened in a loop. Module locking and padlocks are intentionally reserved for later steps.

## Compatibility

The state remains scoped to `inrcy_accounts.id`, so every new multi-account establishment receives its own independent first-opening flow. Existing establishments remain completed by the step 2 migration.
