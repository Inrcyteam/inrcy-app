import { getAiEngineOption, type AiPreferredEngine } from "@/lib/aiEnginePreference";

export type AiEngineRuntimeCalibration = {
  temperatureOffset: number;
  outputTokenMultiplier: number;
  timeoutMultiplier: number;
};

export type AiEngineCalibrationMap = Record<AiPreferredEngine, AiEngineRuntimeCalibration>;

const NEUTRAL_CALIBRATION: AiEngineRuntimeCalibration = {
  temperatureOffset: 0,
  outputTokenMultiplier: 1,
  timeoutMultiplier: 1,
};

/**
 * Base sûre et neutre. Les différences natives sont déjà définies dans
 * aiWritingProfile.ts. Les ajustements ci-dessous sont destinés aux résultats
 * de la QA live V2 et peuvent être surchargés sans redéployer le code via
 * AI_ENGINE_CALIBRATION_JSON.
 */
const DEFAULT_AI_ENGINE_CALIBRATIONS: AiEngineCalibrationMap = {
  openai: { ...NEUTRAL_CALIBRATION },
  anthropic: { ...NEUTRAL_CALIBRATION },
  google: { ...NEUTRAL_CALIBRATION },
  mistral: { ...NEUTRAL_CALIBRATION },
  xai: { ...NEUTRAL_CALIBRATION },
  perplexity: { ...NEUTRAL_CALIBRATION },
  deepseek: { ...NEUTRAL_CALIBRATION },
  meta: { ...NEUTRAL_CALIBRATION },
};

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeCalibration(
  value: unknown,
  fallback: AiEngineRuntimeCalibration,
): AiEngineRuntimeCalibration {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  return {
    // Un rapport QA ne peut jamais faire basculer brutalement la personnalité.
    temperatureOffset: clamp(
      row.temperatureOffset ?? row.temperature_offset,
      -0.2,
      0.2,
      fallback.temperatureOffset,
    ),
    outputTokenMultiplier: clamp(
      row.outputTokenMultiplier ?? row.output_token_multiplier,
      0.75,
      1.35,
      fallback.outputTokenMultiplier,
    ),
    timeoutMultiplier: clamp(
      row.timeoutMultiplier ?? row.timeout_multiplier,
      0.75,
      1.35,
      fallback.timeoutMultiplier,
    ),
  };
}

let cachedRaw = "";
let cachedOverrides: Partial<AiEngineCalibrationMap> = {};

function getRuntimeOverrides(): Partial<AiEngineCalibrationMap> {
  const raw = String(process.env.AI_ENGINE_CALIBRATION_JSON || "").trim();
  if (raw === cachedRaw) return cachedOverrides;

  cachedRaw = raw;
  cachedOverrides = {};
  if (!raw) return cachedOverrides;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Partial<AiEngineCalibrationMap> = {};

    for (const engine of Object.keys(DEFAULT_AI_ENGINE_CALIBRATIONS) as AiPreferredEngine[]) {
      if (!(engine in parsed)) continue;
      next[engine] = normalizeCalibration(
        parsed[engine],
        DEFAULT_AI_ENGINE_CALIBRATIONS[engine],
      );
    }

    cachedOverrides = next;
  } catch {
    // Une calibration invalide ne doit jamais casser la génération.
    cachedOverrides = {};
  }

  return cachedOverrides;
}

export function getAiEngineRuntimeCalibration(
  engine: AiPreferredEngine | string | null | undefined,
): AiEngineRuntimeCalibration {
  const normalizedEngine = getAiEngineOption(engine).value;
  const base = DEFAULT_AI_ENGINE_CALIBRATIONS[normalizedEngine];
  const override = getRuntimeOverrides()[normalizedEngine];
  return override ? { ...base, ...override } : { ...base };
}

export function applyAiEngineTemperatureCalibration(
  baseTemperature: number,
  engine: AiPreferredEngine | string | null | undefined,
) {
  const calibration = getAiEngineRuntimeCalibration(engine);
  return Math.max(
    0.1,
    Math.min(1.3, Number((baseTemperature + calibration.temperatureOffset).toFixed(2))),
  );
}

export function applyAiEngineOutputTokenCalibration(
  baseTokens: number,
  engine: AiPreferredEngine | string | null | undefined,
) {
  const calibration = getAiEngineRuntimeCalibration(engine);
  return Math.max(128, Math.round(baseTokens * calibration.outputTokenMultiplier));
}

export function applyAiEngineTimeoutCalibration(
  baseTimeoutMs: number,
  engine: AiPreferredEngine | string | null | undefined,
) {
  const calibration = getAiEngineRuntimeCalibration(engine);
  return Math.max(5_000, Math.round(baseTimeoutMs * calibration.timeoutMultiplier));
}

