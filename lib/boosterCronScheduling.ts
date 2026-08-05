export type BoosterCronSweepPlan = {
  runRecoverySweep: boolean;
  runFinalizationSweep: boolean;
  finalizationAscending: boolean;
};

/**
 * Queue ingress is checked every minute by the cron route. The heavier stale
 * recovery and parent-reconciliation scans alternate, so each safety net is
 * still exercised every two minutes without making PostgreSQL evaluate every
 * JSONB queue index on every tick.
 */
export function getBoosterCronSweepPlan(nowMs: number): BoosterCronSweepPlan {
  const minute = Math.floor(nowMs / 60_000);
  const runRecoverySweep = minute % 2 === 0;
  return {
    runRecoverySweep,
    runFinalizationSweep: !runRecoverySweep,
    // Alternate both ends of the parent queue on successive finalization
    // sweeps. This retains the old oldest/newest fairness with one scan.
    finalizationAscending: Math.floor(minute / 2) % 2 === 0,
  };
}
