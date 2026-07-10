#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildCalibrationRecommendations } from "./lib/ai-calibration-recommendations.mjs";

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("Usage: node scripts/calibrate-ai-engines.mjs <rapport-live.json> [sortie.json]");
  const inputPath = resolve(process.cwd(), input);
  const report = JSON.parse(await readFile(inputPath, "utf8"));
  const recommendation = buildCalibrationRecommendations(report);
  const outputPath = resolve(
    process.cwd(),
    process.argv[3] || "artifacts/ai-engine-calibration.recommended.json",
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(recommendation, null, 2)}\n`, "utf8");
  console.log(`[AI calibration] recommandations écrites dans ${outputPath}`);
  console.log(`[AI calibration] variable runtime : AI_ENGINE_CALIBRATION_JSON='${JSON.stringify(recommendation.calibration)}'`);
}

main().catch((error) => {
  console.error("[AI calibration] ERREUR", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
