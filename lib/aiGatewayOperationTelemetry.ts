import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

export type AiGatewayOperationCallStatus = "success" | "failure";

export type AiGatewayOperationCallTelemetry = {
  feature: string;
  engine?: string;
  model: string;
  transport?: "vercel_ai_gateway" | "openai_direct";
  fallbackStage?: "primary" | "gateway_model" | "openai_direct";
  status: AiGatewayOperationCallStatus;
  statusCode?: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reservedOutputTokens: number;
  costMicroUsd: number;
  pricingSource: "configured" | "conservative_fallback";
  usageEstimated: boolean;
  durationMs: number;
  hasImages: boolean;
  httpAttempts: number;
};

export type AiGatewayOperationTelemetrySnapshot = {
  callCount: number;
  successCount: number;
  failureCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reservedOutputTokens: number;
  costMicroUsd: number;
  durationMsTotal: number;
  usageEstimatedCalls: number;
  configuredPricingCalls: number;
  fallbackPricingCalls: number;
  maxHttpAttempts: number;
  calls: AiGatewayOperationCallTelemetry[];
};

type Collector = {
  calls: AiGatewayOperationCallTelemetry[];
};

const storage = new AsyncLocalStorage<Collector>();

function nonNegativeInt(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function recordAiGatewayOperationCall(
  event: AiGatewayOperationCallTelemetry,
): void {
  const collector = storage.getStore();
  if (!collector) return;
  collector.calls.push({
    ...event,
    inputTokens: nonNegativeInt(event.inputTokens),
    outputTokens: nonNegativeInt(event.outputTokens),
    totalTokens: nonNegativeInt(event.totalTokens),
    reservedOutputTokens: nonNegativeInt(event.reservedOutputTokens),
    costMicroUsd: nonNegativeInt(event.costMicroUsd),
    durationMs: nonNegativeInt(event.durationMs),
    httpAttempts: Math.max(1, nonNegativeInt(event.httpAttempts)),
  });
}

export function summarizeAiGatewayOperationTelemetry(
  calls: AiGatewayOperationCallTelemetry[],
): AiGatewayOperationTelemetrySnapshot {
  const safeCalls = calls.map((call) => ({ ...call }));
  const sum = (key: keyof AiGatewayOperationCallTelemetry) =>
    safeCalls.reduce((total, row) => total + nonNegativeInt(row[key]), 0);

  return {
    callCount: safeCalls.length,
    successCount: safeCalls.filter((row) => row.status === "success").length,
    failureCount: safeCalls.filter((row) => row.status === "failure").length,
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    totalTokens: sum("totalTokens"),
    reservedOutputTokens: sum("reservedOutputTokens"),
    costMicroUsd: sum("costMicroUsd"),
    durationMsTotal: sum("durationMs"),
    usageEstimatedCalls: safeCalls.filter((row) => row.usageEstimated).length,
    configuredPricingCalls: safeCalls.filter((row) => row.pricingSource === "configured").length,
    fallbackPricingCalls: safeCalls.filter((row) => row.pricingSource === "conservative_fallback").length,
    maxHttpAttempts: safeCalls.reduce(
      (max, row) => Math.max(max, nonNegativeInt(row.httpAttempts)),
      0,
    ),
    calls: safeCalls,
  };
}

export type AiGatewayOperationTelemetryCapture<T> =
  | {
      ok: true;
      result: T;
      telemetry: AiGatewayOperationTelemetrySnapshot;
    }
  | {
      ok: false;
      error: unknown;
      telemetry: AiGatewayOperationTelemetrySnapshot;
    };

/**
 * Exécute une opération IA en conservant la télémétrie même lorsqu'elle échoue.
 * Utilisé par la certification live pour mesurer les tentatives réelles sans
 * transformer une erreur fournisseur en faux succès.
 */
export async function captureAiGatewayOperationTelemetry<T>(
  operation: () => Promise<T>,
): Promise<AiGatewayOperationTelemetryCapture<T>> {
  const collector: Collector = { calls: [] };
  return storage.run(collector, async () => {
    try {
      const result = await operation();
      return {
        ok: true as const,
        result,
        telemetry: summarizeAiGatewayOperationTelemetry(collector.calls),
      };
    } catch (error) {
      return {
        ok: false as const,
        error,
        telemetry: summarizeAiGatewayOperationTelemetry(collector.calls),
      };
    }
  });
}
