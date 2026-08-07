"use client";

import { isTransientBrowserNetworkError } from "@/lib/clientExpectedErrors";
import {
  normalizeBoosterGenerationRequestId,
  type BoosterGenerationRecoveryPayload,
} from "@/lib/boosterGenerationRecovery";

export type BoosterGenerationRecoveryResult =
  | {
      status: "ready";
      payload: BoosterGenerationRecoveryPayload;
      attempts: number;
      elapsedMs: number;
    }
  | {
      status: "unavailable";
      attempts: number;
      elapsedMs: number;
      lastHttpStatus: number | null;
    };

const RECOVERY_MAX_ATTEMPTS = 16;
const RECOVERY_MAX_WAIT_MS = 65_000;
const RECOVERY_FETCH_TIMEOUT_MS = 4_000;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function errorName(value: unknown) {
  return String((value as { name?: unknown } | null)?.name || "")
    .toLowerCase()
    .trim();
}

function errorMessage(value: unknown) {
  return String(
    value instanceof Error
      ? value.message
      : (value as { message?: unknown } | null)?.message || value || "",
  )
    .toLowerCase()
    .trim();
}

export function isBoosterGenerationTransportLoss(value: unknown): boolean {
  if (isTransientBrowserNetworkError(value)) return true;
  if (errorName(value) === "aborterror") return true;

  const message = errorMessage(value);
  return [
    "the network connection was lost",
    "not connected to the internet",
    "internet connection was lost",
    "connexion réseau perdue",
    "connexion a été interrompue",
    "délai de sécurité",
    "delai de securite",
  ].some((pattern) => message.includes(pattern));
}

export function createBoosterGenerationRequestId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const bytes = new Uint32Array(4);
      crypto.getRandomValues(bytes);
      const randomPart = Array.from(bytes, (value) => value.toString(36)).join("");
      const candidate = `bg_${Date.now().toString(36)}_${randomPart}`.slice(0, 80);
      if (normalizeBoosterGenerationRequestId(candidate)) return candidate;
    }
  } catch {}

  return `bg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`.slice(
    0,
    80,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function readRecoveryResultOnce(params: {
  workspaceId: string;
  requestId: string;
  timeoutMs: number;
}) {
  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), params.timeoutMs)
    : null;
  try {
    const query = new URLSearchParams({
      workspaceId: params.workspaceId,
      requestId: params.requestId,
    });
    const response = await fetch(`/api/booster/generation-result?${query}`, {
      cache: "no-store",
      ...(controller ? { signal: controller.signal } : {}),
    });
    const json = await response.json().catch(() => ({}));
    return { response, json: asRecord(json) };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function recoverBoosterGenerationResult(params: {
  workspaceId: string;
  requestId: string;
  maxWaitMs?: number;
}): Promise<BoosterGenerationRecoveryResult> {
  const startedAt = Date.now();
  const workspaceId = String(params.workspaceId || "").trim();
  const requestId = normalizeBoosterGenerationRequestId(params.requestId);
  if (!workspaceId || !requestId) {
    return {
      status: "unavailable",
      attempts: 0,
      elapsedMs: 0,
      lastHttpStatus: null,
    };
  }

  const maxWaitMs = Math.max(
    1_000,
    Math.min(90_000, params.maxWaitMs || RECOVERY_MAX_WAIT_MS),
  );
  const deadlineAt = startedAt + maxWaitMs;
  let attempts = 0;
  let lastHttpStatus: number | null = null;

  for (let attempt = 0; attempt < RECOVERY_MAX_ATTEMPTS; attempt += 1) {
    const delayMs =
      attempt === 0 ? 0 : Math.min(6_000, 800 * 2 ** (attempt - 1));
    const remainingBeforeDelay = deadlineAt - Date.now();
    if (remainingBeforeDelay <= 0) break;
    if (delayMs > 0) {
      await wait(Math.min(delayMs, remainingBeforeDelay));
    }
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) break;

    attempts += 1;
    try {
      const { response, json } = await readRecoveryResultOnce({
        workspaceId,
        requestId,
        timeoutMs: Math.max(
          300,
          Math.min(RECOVERY_FETCH_TIMEOUT_MS, remainingMs),
        ),
      });
      lastHttpStatus = response.status;
      if (
        response.ok &&
        json.status === "ready" &&
        normalizeBoosterGenerationRequestId(json.generationRequestId) ===
          requestId &&
        Object.keys(asRecord(json.versions)).length > 0
      ) {
        return {
          status: "ready",
          payload: json as BoosterGenerationRecoveryPayload,
          attempts,
          elapsedMs: Date.now() - startedAt,
        };
      }

      if ([400, 401, 403, 404].includes(response.status)) break;
    } catch {
      // Le réseau peut revenir pendant la courte fenêtre de récupération.
      // Aucun de ces essais ne relance le moteur IA.
    }
  }

  return {
    status: "unavailable",
    attempts,
    elapsedMs: Date.now() - startedAt,
    lastHttpStatus,
  };
}

function transportReason(error: unknown) {
  if (errorName(error) === "aborterror") return "browser_abort";
  const message = errorMessage(error);
  if (message.includes("délai de sécurité") || message.includes("delai de securite")) {
    return "client_deadline";
  }
  if (isTransientBrowserNetworkError(error)) return "browser_network";
  return "connection_interrupted";
}

export function reportBoosterGenerationResponseLoss(params: {
  error: unknown;
  recovered: boolean;
  attempts: number;
  elapsedMs: number;
  channelCount: number;
  mediaType: "images" | "video";
  engine: string;
}) {
  const details = {
    recovered: params.recovered,
    reason: transportReason(params.error),
    attempts: params.attempts,
    elapsedMs: params.elapsedMs,
    channelCount: params.channelCount,
    mediaType: params.mediaType,
    engine: String(params.engine || "unknown").slice(0, 40),
    browserOnline:
      typeof navigator === "undefined" ? null : navigator.onLine,
    pageVisibility:
      typeof document === "undefined" ? "unknown" : document.visibilityState,
  };

  console.warn("[booster-generation] response lost", details);
  void import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.withScope((scope) => {
        scope.setLevel("warning");
        scope.setTag("booster.recovered", String(details.recovered));
        scope.setTag("booster.transport_reason", details.reason);
        scope.setTag("booster.media_type", details.mediaType);
        scope.setContext("booster_generation_transport", details);
        Sentry.captureMessage("booster_generation_response_lost", "warning");
      });
    })
    .catch(() => undefined);
}
