import { percentile } from "./ai-live-qa-evaluator.mjs";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values) {
  const safe = values.map(Number).filter(Number.isFinite);
  return safe.length ? safe.reduce((sum, value) => sum + value, 0) / safe.length : 0;
}

export function buildCalibrationRecommendations(report) {
  const results = Array.isArray(report?.results) ? report.results : [];
  const crossEngine = report?.crossEngineDiversity || {};
  const engines = Array.from(new Set(results.map((row) => row.engine).filter(Boolean)));
  const recommendations = {};

  for (const engine of engines) {
    const rows = results.filter((row) => row.engine === engine);
    const successes = rows.filter((row) => row.success);
    const successRate = rows.length ? successes.length / rows.length : 0;
    const scores = successes.map((row) => row.quality?.totalScore || 0);
    const preferences = successes.map((row) => row.quality?.preferenceAdherence || 0);
    const completeness = successes.map((row) => row.quality?.completeness || 0);
    const repairRate = successes.length ? successes.filter((row) => row.repairUsed).length / successes.length : 1;
    const durations = successes.map((row) => row.durationMs || 0);
    const outputUtilization = successes
      .map((row) => row.outputTokenUtilization)
      .filter((value) => Number.isFinite(Number(value)));
    const diversity = Number(crossEngine[engine] || 0);

    const avgScore = average(scores);
    const avgPreferences = average(preferences);
    const avgCompleteness = average(completeness);
    const avgOutputUtilization = average(outputUtilization);
    const p95DurationMs = percentile(durations, 0.95);

    let temperatureOffset = 0;
    if (successRate < 0.9 || avgPreferences < 0.72 || avgScore < 0.72) {
      temperatureOffset = -0.06;
    } else if (diversity > 0 && diversity < 0.58 && avgPreferences >= 0.82 && avgScore >= 0.82) {
      temperatureOffset = 0.05;
    }

    let outputTokenMultiplier = 1;
    if (avgCompleteness < 0.96 && avgOutputUtilization >= 0.72) {
      outputTokenMultiplier = 1.12;
    } else if (avgCompleteness >= 0.99 && avgOutputUtilization > 0 && avgOutputUtilization < 0.36 && repairRate < 0.08) {
      outputTokenMultiplier = 0.92;
    }

    let timeoutMultiplier = 1;
    if (p95DurationMs >= 55_000 && successRate >= 0.85) timeoutMultiplier = 1.12;
    else if (p95DurationMs > 0 && p95DurationMs <= 18_000 && successRate >= 0.98) timeoutMultiplier = 0.95;

    recommendations[engine] = {
      temperatureOffset: Number(clamp(temperatureOffset, -0.2, 0.2).toFixed(2)),
      outputTokenMultiplier: Number(clamp(outputTokenMultiplier, 0.75, 1.35).toFixed(2)),
      timeoutMultiplier: Number(clamp(timeoutMultiplier, 0.75, 1.35).toFixed(2)),
      evidence: {
        cases: rows.length,
        successes: successes.length,
        successRate: Number(successRate.toFixed(4)),
        averageQualityScore: Number(avgScore.toFixed(4)),
        averagePreferenceAdherence: Number(avgPreferences.toFixed(4)),
        averageCompleteness: Number(avgCompleteness.toFixed(4)),
        repairRate: Number(repairRate.toFixed(4)),
        crossEngineDiversity: Number(diversity.toFixed(4)),
        p95DurationMs,
        averageOutputTokenUtilization: Number(avgOutputUtilization.toFixed(4)),
      },
    };
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceReport: report?.reportId || null,
    calibration: Object.fromEntries(
      Object.entries(recommendations).map(([engine, value]) => [
        engine,
        {
          temperatureOffset: value.temperatureOffset,
          outputTokenMultiplier: value.outputTokenMultiplier,
          timeoutMultiplier: value.timeoutMultiplier,
        },
      ]),
    ),
    evidence: Object.fromEntries(
      Object.entries(recommendations).map(([engine, value]) => [engine, value.evidence]),
    ),
    note: "Recommandation automatique bornée. Appliquer via AI_ENGINE_CALIBRATION_JSON après revue du rapport live.",
  };
}
