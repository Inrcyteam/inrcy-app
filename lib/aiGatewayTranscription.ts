import "server-only";

import {
  cleanAiGatewayEnv,
  getAiGatewayCredential,
  getAiGatewayTranscriptionUrl,
  normalizeGatewayModelId,
} from "@/lib/aiGatewayConfig";
import {
  commitAiGatewayAccountAttempt,
  recordAiGatewayAccountFailure,
  reserveAiGatewayAccountAttempt,
  rollbackAiGatewayAccountAttempt,
  type AiGatewayAccountAttemptReservation,
} from "@/lib/aiGatewayAccountGuard";
import { assertAllowedAiGatewayTranscriptionModel } from "@/lib/aiGatewayPolicy";
import { fetchWithRetry } from "@/lib/observability/fetch";

const DEFAULT_TRANSCRIBE_MODEL = "openai/gpt-4o-transcribe";
const DEFAULT_TRANSCRIBE_FALLBACK_MODEL = "openai/whisper-1";

type AiGatewayTranscriptionResponse = {
  text?: string;
  segments?: unknown[];
  language?: string;
  durationInSeconds?: number;
  warnings?: unknown[];
};

export type AiGatewayTranscriptionResult = {
  text: string;
  model: string;
  language?: string;
  durationInSeconds?: number;
  warnings: unknown[];
};

function getConfiguredModels(): string[] {
  const primary = normalizeGatewayModelId(
    cleanAiGatewayEnv(process.env.AI_GATEWAY_TRANSCRIBE_MODEL) || DEFAULT_TRANSCRIBE_MODEL,
  );
  const fallback = normalizeGatewayModelId(
    cleanAiGatewayEnv(process.env.AI_GATEWAY_TRANSCRIBE_FALLBACK_MODEL) || DEFAULT_TRANSCRIBE_FALLBACK_MODEL,
  );
  return Array.from(new Set([primary, fallback]));
}

function normalizeMediaType(value: unknown): string {
  const raw = cleanAiGatewayEnv(value).toLowerCase().split(";")[0]?.trim() || "";
  return raw || "audio/webm";
}

function cleanTranscript(value: unknown): string {
  return String(value || "").trim();
}

/**
 * Point d'entrée unique de transcription brute iNrCy.
 *
 * Utilise l'endpoint REST Speech-to-Text du Vercel AI Gateway. Aucun appel
 * fournisseur direct n'est autorisé ici. Les tentatives réelles sont comptées
 * dans les garde-fous économiques par établissement actif.
 */
export async function aiTranscribeMedia(args: {
  file: File;
  accountId?: string;
  mediaType?: string;
  retries?: number;
  timeoutMs?: number;
}): Promise<AiGatewayTranscriptionResult> {
  const credential = getAiGatewayCredential();
  if (!credential) throw new Error("Configuration AI Gateway manquante.");

  const audio = Buffer.from(await args.file.arrayBuffer()).toString("base64");
  const mediaType = normalizeMediaType(args.mediaType || args.file.type);
  const url = getAiGatewayTranscriptionUrl();
  const models = getConfiguredModels();
  const errors: string[] = [];
  const hardDeadlineAt = Date.now() + Math.max(15_000, Math.min(110_000, Math.floor(args.timeoutMs ?? 100_000)));

  for (const model of models) {
    assertAllowedAiGatewayTranscriptionModel(
      model,
      process.env.AI_GATEWAY_ALLOWED_TRANSCRIPTION_MODELS,
    );

    try {
      const attemptReservations = new Map<number, AiGatewayAccountAttemptReservation | null>();
      let successfulReservation: AiGatewayAccountAttemptReservation | null = null;
      const response = await fetchWithRetry(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential}`,
          "ai-model-id": model,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ audio, mediaType }),
        retries: Math.max(0, Math.min(1, Math.floor(args.retries ?? 1))),
        timeoutMs: Math.max(10_000, Math.min(90_000, Math.floor(args.timeoutMs ?? 70_000))),
        deadlineAt: hardDeadlineAt,
        retryStatuses: [408, 500, 502, 503, 504],
        onAttempt: async (attempt) => {
          const reservation = await reserveAiGatewayAccountAttempt(args.accountId, {
            reservedOutputTokens: 128,
            estimatedCostMicroUsd: 1,
          });
          attemptReservations.set(attempt, reservation);
        },
        onAttemptSettled: async ({ attempt, response: settledResponse }) => {
          const reservation = attemptReservations.get(attempt) || null;
          if (settledResponse?.ok) {
            successfulReservation = reservation;
            return;
          }
          await rollbackAiGatewayAccountAttempt(reservation).catch(() => undefined);
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        await recordAiGatewayAccountFailure({
          accountId: args.accountId,
          feature: "booster.transcribe",
          model,
          status: response.status,
        }).catch(() => undefined);
        errors.push(`${model}: ${response.status} ${errorText || response.statusText}`.trim());
        if (response.status === 401 || response.status === 403) break;
        continue;
      }

      const result = (await response.json().catch(() => ({}))) as AiGatewayTranscriptionResponse;
      const text = cleanTranscript(result.text);
      if (!text) {
        errors.push(`${model}: transcription vide`);
        continue;
      }

      await commitAiGatewayAccountAttempt({
        reservation: successfulReservation,
        feature: "booster.transcribe",
        model,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      }).catch((error) => {
        console.warn("[ai-gateway] transcription atomic usage commit unavailable", {
          model,
          message: error instanceof Error ? error.message : String(error),
        });
      });

      console.info("[ai-gateway] transcription usage", {
        feature: "booster.transcribe",
        model,
        accountId: args.accountId || undefined,
        mediaType,
        durationInSeconds: result.durationInSeconds,
        language: result.language,
      });

      return {
        text,
        model,
        language: result.language,
        durationInSeconds: result.durationInSeconds,
        warnings: Array.isArray(result.warnings) ? result.warnings : [],
      };
    } catch (error) {
      errors.push(`${model}: ${error instanceof Error ? error.message : "échec de transcription"}`);
    }
  }

  throw new Error(
    `AI Gateway transcription indisponible : ${errors.filter(Boolean).join(" | ") || "aucun résultat"}`,
  );
}
